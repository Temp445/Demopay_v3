/**
 * Email Draft Service
 * 
 * Handles:
 * - Saving EmailIntent responses as drafts
 * - Approval workflow (pending/approved/rejected)
 * - Rendering templates with merge data
 * - Draft versioning
 */

import { supabase } from '../lib/supabase';
import type { EmailIntent } from '../schemas/email_intent.schema';
import { EmailTemplateService } from './email-template.service';

export interface EmailDraft {
    id: string;
    tenant_id: string;
    user_id: string;
    intent: EmailIntent;
    template_id?: string;
    language_code: string;
    subject: string;
    body_html: string;
    body_plain?: string;
    recipients: {
        to: Array<{ email: string; name?: string }>;
        cc?: Array<{ email: string; name?: string }>;
        bcc?: Array<{ email: string; name?: string }>;
    };
    attachments?: Array<{
        filename: string;
        content: string;
        type: string;
    }>;
    in_reply_to?: string;
    thread_id?: string;
    send_at?: string;
    status: 'pending' | 'approved' | 'rejected' | 'sent' | 'failed';
    approved_by?: string;
    approved_at?: string;
    rejection_reason?: string;
    version: number;
    crm_entity_refs?: Array<{ type: string; id: string }>;
    created_at: string;
    updated_at: string;
}

export interface CreateDraftInput {
    intent: EmailIntent;
    user_id: string;
    tenant_id: string; // Organization ID
}

export class EmailDraftService {
    /**
     * Create draft from EmailIntent
     */
    static async createDraft(input: CreateDraftInput): Promise<EmailDraft> {
        const { intent, user_id, tenant_id } = input;

        // Render template if template_id provided
        let subject = intent.subject;
        let body_html = intent.body;

        if (intent.template_id && intent.merge_data) {
            const rendered = await EmailTemplateService.renderTemplate(
                intent.template_id,
                intent.merge_data
            );
            subject = rendered.subject;
            body_html = rendered.body;
        }

        // Build recipients object
        const recipients = {
            to: intent.recipients.map(email => ({ email })),
            cc: intent.cc?.map(email => ({ email })),
            bcc: intent.bcc?.map(email => ({ email })),
        };

        // Create draft
        const { data, error } = await supabase
            .from('email_drafts')
            .insert({
                tenant_id,
                user_id,
                intent,
                template_id: intent.template_id,
                language_code: intent.language_code || 'en',
                subject,
                body_html,
                recipients,
                in_reply_to: intent.in_reply_to,
                thread_id: intent.thread_id,
                send_at: intent.send_at,
                crm_entity_refs: intent.crm_entity_refs,
                status: 'pending',
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create draft: ${error.message}`);
        }

        return data;
    }

    /**
     * List user's drafts with pagination and status filtering
     */
    static async listDrafts(
        userId: string,
        status: string = 'draft', // 'draft', 'sent', etc.
        page: number = 1,
        limit: number = 10
    ): Promise<{ data: EmailDraft[]; count: number }> {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase
            .from('email_drafts')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (status === 'draft') {
            // "Drafts" tab should show drafts, rejected, pending approval. Basically anything NOT sent.
            // Or strictly 'draft'? Usage suggests we want to separate "Sent" from everything else.
            // Let's filter OUT 'sent' for the drafts tab.
            query = query.neq('status', 'sent');
        } else if (status === 'sent') {
            query = query.eq('status', 'sent');
        } else {
            // Specific status if needed
            query = query.eq('status', status);
        }

        const { data, error, count } = await query;

        if (error) {
            throw new Error(`Failed to list drafts: ${error.message}`);
        }

        return { data: data || [], count: count || 0 };
    }

    /**
     * Delete draft
     */
    static async deleteDraft(draftId: string): Promise<void> {
        const { error } = await supabase
            .from('email_drafts')
            .delete()
            .eq('id', draftId);

        if (error) {
            throw new Error(`Failed to delete draft: ${error.message}`);
        }
    }

    /**
     * Update existing draft
     */
    static async updateDraft(draftId: string, updates: Partial<EmailDraft>): Promise<EmailDraft> {
        const { data, error } = await supabase
            .from('email_drafts')
            .update({
                subject: updates.subject,
                body_html: updates.body_html,
                body_text: updates.body_text,
                recipients: updates.recipients,
                template_id: updates.template_id,
                merge_data: updates.merge_data,
                crm_entity_refs: updates.crm_entity_refs,
                updated_at: new Date().toISOString(),
            })
            .eq('id', draftId)
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to update draft: ${error.message}`);
        }

        return data;
    }


    /**
     * Get draft by ID
     */
    static async getDraftById(draftId: string): Promise<EmailDraft | null> {

        const { data, error } = await supabase
            .from('email_drafts')
            .select('*')
            .eq('id', draftId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            throw new Error(`Failed to fetch draft: ${error.message}`);
        }

        return data;
    }

    /**
     * Get pending drafts for approval
     */
    static async getPendingDrafts(userId?: string): Promise<EmailDraft[]> {

        let query = supabase
            .from('email_drafts')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(`Failed to fetch pending drafts: ${error.message}`);
        }

        return data || [];
    }

    /**
     * Approve draft
     */
    static async approveDraft(draftId: string, approvedBy: string): Promise<EmailDraft> {

        const { data, error } = await supabase
            .from('email_drafts')
            .update({
                status: 'approved',
                approved_by: approvedBy,
                approved_at: new Date().toISOString(),
            })
            .eq('id', draftId)
            .eq('status', 'pending') // Only approve if still pending
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to approve draft: ${error.message}`);
        }

        return data;
    }

    /**
     * Reject draft
     */
    static async rejectDraft(
        draftId: string,
        rejectedBy: string,
        reason?: string
    ): Promise<EmailDraft> {

        const { data, error } = await supabase
            .from('email_drafts')
            .update({
                status: 'rejected',
                approved_by: rejectedBy,
                approved_at: new Date().toISOString(),
                rejection_reason: reason,
            })
            .eq('id', draftId)
            .eq('status', 'pending')
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to reject draft: ${error.message}`);
        }

        return data;
    }

    /**
     * Mark draft as sent
     */
    static async markAsSent(draftId: string): Promise<void> {

        const { error } = await supabase
            .from('email_drafts')
            .update({ status: 'sent' })
            .eq('id', draftId);

        if (error) {
            throw new Error(`Failed to mark draft as sent: ${error.message}`);
        }
    }

    /**
     * Mark draft as failed
     */
    static async markAsFailed(draftId: string): Promise<void> {

        const { error } = await supabase
            .from('email_drafts')
            .update({ status: 'failed' })
            .eq('id', draftId);

        if (error) {
            throw new Error(`Failed to mark draft as failed: ${error.message}`);
        }
    }

}
