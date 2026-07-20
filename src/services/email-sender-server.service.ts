/**
 * Email Sender Service (Server-Side Version)
 * 
 * This version uses nodemailer and can only be used in server-side code (API routes).
 * For browser/client code, use the API wrapper version.
 */

import { supabase } from '../lib/supabase';
import { EmailProviderFactory, type EmailMessage } from './email-provider.service';
import { EmailDraftService } from './email-draft.service';
import { EmailAttachmentService } from './email-attachment.service';
import { CrmActivityService } from './crm-activity.service';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000];

export interface SendEmailInput {
    draft_id: string;
    user_id: string;
}

export interface EmailLog {
    id: string;
    draft_id?: string;
    tenant_id: string;
    user_id: string;
    subject: string;
    body_html: string;
    recipients: any;
    attachment_count: number;
    provider_used: string;
    sent_at?: string;
    status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed';
    delivered_at?: string;
    bounce_reason?: string;
    error_message?: string;
    retry_count: number;
    last_retry_at?: string;
    crm_entity_refs?: any;
    thread_id?: string;
    provider_message_id?: string;
    created_at: string;
}

export class EmailSenderServiceServerSide {
    static async sendEmail(input: SendEmailInput): Promise<EmailLog> {
        const draft = await EmailDraftService.getDraftById(input.draft_id);
        if (!draft) {
            throw new Error('Draft not found');
        }

        const intent = draft.intent as any;
        if (intent.approval_required && draft.status !== 'approved') {
            throw new Error('Draft must be approved before sending');
        }

        const { data: settings, error: settingsError } = await supabase
            .from('tenant_email_settings')
            .select('*')
            .eq('tenant_id', draft.tenant_id)
            .single();

        if (settingsError || !settings) {
            throw new Error('Tenant email settings not configured');
        }

        const attachments = await EmailAttachmentService.getAttachments(input.draft_id);

        const attachmentData = await Promise.all(
            attachments.map(async (att) => {
                const { data, filename } = await EmailAttachmentService.downloadAttachment(att.id);
                const buffer = Buffer.from(await data.arrayBuffer());
                return {
                    filename,
                    content: buffer,
                    contentType: att.content_type,
                };
            })
        );

        const emailMessage: EmailMessage = {
            from: {
                email: settings.default_from_email,
                name: settings.default_from_name,
            },
            to: draft.recipients.to,
            cc: draft.recipients.cc,
            bcc: draft.recipients.bcc,
            subject: draft.subject,
            html: settings.email_signature
                ? `${draft.body_html}<br><br>${settings.email_signature}`
                : draft.body_html,
            text: draft.body_plain,
            attachments: attachmentData,
            replyTo: settings.default_reply_to,
        };

        if (draft.in_reply_to) {
            emailMessage.headers = {
                'In-Reply-To': draft.in_reply_to,
                'References': draft.in_reply_to,
            };
        }

        const { data: emailLog, error: logError } = await supabase
            .from('email_logs')
            .insert({
                draft_id: input.draft_id,
                tenant_id: draft.tenant_id,
                user_id: input.user_id,
                subject: draft.subject,
                body_html: draft.body_html,
                recipients: draft.recipients,
                attachment_count: attachments.length,
                provider_used: settings.provider_type,
                status: 'queued',
                crm_entity_refs: draft.crm_entity_refs,
                thread_id: draft.thread_id,
            })
            .select()
            .single();

        if (logError) {
            throw new Error(`Failed to create email log: ${logError.message}`);
        }

        let lastError: string | undefined;
        let success = false;
        let messageId: string | undefined;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const provider = EmailProviderFactory.create(settings);
                const result = await provider.send(emailMessage);

                if (result.success) {
                    success = true;
                    messageId = result.message_id;
                    break;
                } else {
                    lastError = result.error;
                }
            } catch (error) {
                lastError = error instanceof Error ? error.message : 'Unknown error';
            }

            if (attempt < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
            }

            await supabase
                .from('email_logs')
                .update({
                    retry_count: attempt + 1,
                    last_retry_at: new Date().toISOString(),
                })
                .eq('id', emailLog.id);
        }

        const finalStatus = success ? 'sent' : 'failed';
        const { data: updatedLog } = await supabase
            .from('email_logs')
            .update({
                status: finalStatus,
                sent_at: success ? new Date().toISOString() : null,
                error_message: lastError,
                provider_message_id: messageId,
            })
            .eq('id', emailLog.id)
            .select()
            .single();

        if (success) {
            await EmailDraftService.markAsSent(input.draft_id);
        } else {
            await EmailDraftService.markAsFailed(input.draft_id);
        }

        if (success && draft.crm_entity_refs) {
            const activities = draft.crm_entity_refs.map((ref: any) => ({
                entity_type: ref.type as 'lead' | 'contact' | 'account' | 'quote' | 'opportunity',
                entity_id: ref.id,
                activity_type: 'email_sent' as const,
                title: `Email sent: ${draft.subject}`,
                email_log_id: emailLog.id,
                user_id: input.user_id,
            }));

            await CrmActivityService.createActivities(draft.tenant_id, activities);
        }

        if (!success) {
            throw new Error(`Failed to send email after ${MAX_RETRIES} attempts: ${lastError}`);
        }

        return updatedLog!;
    }
}
