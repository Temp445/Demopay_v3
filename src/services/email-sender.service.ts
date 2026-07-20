/**
 * Email Sender Service (Browser-Safe Version)
 * 
 * This is a browser-safe wrapper that calls ace-email-hub to send emails.
 * Email sending happens server-side via the Hub.
 */

import { supabase } from '../lib/supabase';
import { EmailHubClient, SendEmailPayload } from '../lib/email-hub-client';
import { decryptCredential } from './encryption.service';

// export interface SendEmailInput {
//     draft_id: string;
//     user_id: string;
//     attachments?: Array<{ filename: string; content: string; type: string }>;
// }

export interface SendEmailInput {
    tenant_id: string;
    user_id: string;

    to: string;
    cc?: string[];
    bcc?: string[];

    subject: string;
    html: string;

    attachments?: Array<{
        filename: string;
        content: string;   // base64
        type: string;
    }>;
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

export class EmailSenderService {
    /**
     * Send an approved email draft via ace-email-hub
     */
    // static async sendEmail(input: SendEmailInput, authToken?: string): Promise<EmailLog> {
    //     // 1. Fetch Draft Details
    //     const { data: draft, error: draftError } = await supabase
    //         .from('email_drafts')
    //         .select('*')
    //         .eq('id', input.draft_id)
    //         .single();

    //     if (draftError || !draft) {
    //         throw new Error(`Draft not found: ${draftError?.message}`);
    //     }

    //     // 2. Fetch Tenant Settings (including encrypted credentials)
    //     const { data: settings, error: settingsError } = await supabase
    //         .from('tenant_email_settings')
    //         .select('*')
    //         .eq('tenant_id', draft.tenant_id)
    //         .single();

    //     if (settingsError || !settings) {
    //         throw new Error('Email settings not configured for this tenant. Please configure email settings first.');
    //     }

    //     // 3. Prepare Payload
    //     const providerType = settings.provider_type || 'smtp';
    //     const recipients = draft.recipients;

    //     // Helper to extract email string from recipient entry (string or object)
    //     const getEmail = (r: any): string | undefined => {
    //         if (typeof r === 'string') return r;
    //         return r?.email;
    //     };

    //     const toRecipient = recipients.to?.[0];
    //     const toEmail = getEmail(toRecipient) || draft.to_address;

    //     if (!toEmail) {
    //         throw new Error('No recipient email address found');
    //     }

    //     let payload: SendEmailPayload;

    //     const emailMessage = {
    //         from: `${settings.default_from_name || 'Email System'} <${settings.default_from_email}>`,
    //         to: toEmail,
    //         cc: recipients.cc?.map((r: any) => getEmail(r)).filter((e: any) => e),
    //         bcc: recipients.bcc?.map((r: any) => getEmail(r)).filter((e: any) => e),
    //         subject: draft.subject,
    //         html: (draft.body_html || draft.body_text || '') + (settings.email_signature || ''),
    //         attachments: (input.attachments || draft.attachments)?.map((a: any) => ({
    //             filename: a.filename,
    //             content: a.content,
    //             contentType: a.type || a.contentType,
    //             encoding: 'base64'
    //         })),
    //     };

    //     if (providerType === 'smtp') {
    //         if (!settings.smtp_host || !settings.smtp_port || !settings.smtp_username || !settings.smtp_password_encrypted) {
    //             throw new Error('Incomplete SMTP settings');
    //         }
    //         payload = {
    //             provider: 'smtp',
    //             config: {
    //                 host: settings.smtp_host,
    //                 port: Number(settings.smtp_port),
    //                 secure: settings.smtp_use_tls || false,
    //                 auth: {
    //                     user: settings.smtp_username,
    //                     pass: settings.smtp_password_encrypted, // Pass encrypted password directly
    //                 },
    //             },
    //             message: emailMessage,
    //         };
    //     } else if (providerType === 'sendgrid') {
    //         if (!settings.sendgrid_api_key_encrypted) {
    //             throw new Error('SendGrid API key not configured');
    //         }
    //         payload = {
    //             provider: 'sendgrid',
    //             config: {
    //                 apiKey: settings.sendgrid_api_key_encrypted,
    //             },
    //             message: emailMessage,
    //         };
    //     } else if (providerType === 'mailgun') {
    //         if (!settings.mailgun_api_key_encrypted || !settings.mailgun_domain) {
    //             throw new Error('Mailgun API key or domain not configured');
    //         }
    //         payload = {
    //             provider: 'mailgun',
    //             config: {
    //                 apiKey: settings.mailgun_api_key_encrypted,
    //                 domain: settings.mailgun_domain,
    //             },
    //             message: emailMessage,
    //         };
    //     } else {
    //         throw new Error(`Unsupported provider: ${providerType}`);
    //     }

    //     // 4. Send Email via Hub
    //     let result;
    //     try {
    //         result = await EmailHubClient.sendEmail(payload);
    //     } catch (error) {
    //         console.error('Email Hub Error:', error);
    //         // Log failure locally if needed, or just throw
    //         throw error;
    //     }

    //     const providerMessageId = result.data?.messageId || result.data?.id || `hub-${Date.now()}`;

    //     // 5. Update Database (Success)
    //     // Insert Log
    //     const { data: logData, error: logError } = await supabase
    //         .from('email_logs')
    //         .insert({
    //             draft_id: draft.id,
    //             user_id: input.user_id,
    //             tenant_id: draft.tenant_id,
    //             subject: draft.subject,
    //             body_html: draft.body_html,
    //             recipients: draft.recipients,
    //             attachment_count: 0,
    //             provider_used: providerType,
    //             sent_at: new Date().toISOString(),
    //             status: 'sent',
    //             provider_message_id: providerMessageId,
    //             crm_entity_refs: draft.crm_entity_refs,
    //             thread_id: draft.thread_id,
    //             retry_count: 0,
    //         })
    //         .select()
    //         .single();

    //     if (logError) {
    //         console.error('Failed to log sent email:', logError);
    //     }

    //     // Update Draft Status
    //     const { error: updateError } = await supabase
    //         .from('email_drafts')
    //         .update({
    //             status: 'sent',
    //             approved_at: new Date().toISOString(),
    //             approved_by: input.user_id,
    //         })
    //         .eq('id', draft.id);

    //     if (updateError) {
    //         console.error('Failed to update draft status:', updateError);
    //     }

    //     return logData as EmailLog;
    // }

    static async sendEmail(input: SendEmailInput): Promise<EmailLog> {

        // 1️⃣ Get Tenant Email Settings
        const { data: settings, error: settingsError } = await supabase
            .from('smtp_configurations')
            .select('*')
            .eq('tenant_id', input.tenant_id)
            .single();

        if (settingsError || !settings) {
            throw new Error(
                'Email settings not configured for this tenant.'
            );
        }

        //const providerType = settings.provider_type || 'smtp';
        const providerType = 'smtp';

        // 2️⃣ Build Message
        const emailMessage = {
            from: `${settings.sender_name || 'Email System'} <${settings.sender_email}>`,
            to: input.to,
            cc: input.cc,
            bcc: input.bcc,
            subject: input.subject,
            html: input.html,
            attachments: input.attachments?.map(a => ({
                filename: a.filename,
                content: a.content,
                contentType: a.type,
                encoding: 'base64',
            })),
        };

        let payload: SendEmailPayload;

        // 3️⃣ Provider Config
        if (providerType === 'smtp') {

            if (!settings.host || !settings.port ||
                !settings.username || !settings.password_encrypted) {
                throw new Error('Incomplete SMTP settings');
            }

            payload = {
                provider: 'smtp',
                config: {
                    host: settings.host,
                    port: Number(settings.port),
                    // secure: settings.smtp_use_tls || false,
                    secure: settings.encryption == "ssl" || false,
                    auth: {
                        user: settings.username,
                        pass: settings.password_encrypted,
                    },
                },
                message: emailMessage,
            };

        } else if (providerType === 'sendgrid') {

            payload = {
                provider: 'sendgrid',
                config: {
                    apiKey: settings.sendgrid_api_key_encrypted,
                },
                message: emailMessage,
            };

        } else if (providerType === 'mailgun') {

            payload = {
                provider: 'mailgun',
                config: {
                    apiKey: settings.mailgun_api_key_encrypted,
                    domain: settings.mailgun_domain,
                },
                message: emailMessage,
            };

        } else {
            throw new Error(`Unsupported provider: ${providerType}`);
        }

        console.log('Email Payload Prepared:', payload);

        // 4️⃣ Send via Email Hub
        const result = await EmailHubClient.sendEmail(payload);

        const providerMessageId =
            result.data?.messageId ||
            result.data?.id ||
            `hub-${Date.now()}`;

        /*
        // 5️⃣ Log Email (No Draft)
        const { data: logData, error: logError } = await supabase
            .from('email_logs')
            .insert({
                tenant_id: input.tenant_id,
                user_id: input.user_id,
                subject: input.subject,
                body_html: input.html,
                recipients: { to: input.to, cc: input.cc, bcc: input.bcc },
                attachment_count: input.attachments?.length || 0,
                provider_used: providerType,
                sent_at: new Date().toISOString(),
                status: 'sent',
                provider_message_id: providerMessageId,
                retry_count: 0,
            })
            .select()
            .single();

        if (logError) {
            console.error('Email log failed:', logError);
        }

        return logData as EmailLog;
*/

    }

    /**
     * Get email log by ID
     * Note: This should be implemented as a direct Supabase query or Edge Function
     */
    static async getEmailLog(emailLogId: string): Promise<EmailLog | null> {
        // TODO: Implement via Supabase client or Edge Function
        console.warn('getEmailLog not yet migrated to Edge Functions');
        return null;
    }

    /**
     * Get email logs for a tenant
     * Note: This should be implemented as a direct Supabase query or Edge Function
     */
    static async getEmailLogs(params?: {
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<EmailLog[]> {
        // TODO: Implement via Supabase client or Edge Function
        console.warn('getEmailLogs not yet migrated to Edge Functions');
        return [];
    }

    /**
     * Update email delivery status (called by webhooks)
     * Note: This should be implemented as an Edge Function
     */
    static async updateDeliveryStatus(
        providerMessageId: string,
        status: 'delivered' | 'bounced',
        bounceReason?: string
    ): Promise<void> {
        // TODO: Implement via Edge Function
        console.warn('updateDeliveryStatus not yet migrated to Edge Functions');
    }
}
