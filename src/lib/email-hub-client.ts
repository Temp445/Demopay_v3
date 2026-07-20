const EMAIL_HUB_URL = import.meta.env.VITE_EMAIL_URL;
const EMAIL_API_KEY = import.meta.env.VITE_EMAIL_API_KEY;

export interface EmailMessage {
    from: string;
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{
        filename: string;
        content: string;
        contentType?: string;
        encoding?: string;
    }>;
}

export interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
}

export interface SendGridConfig {
    apiKey: string;
}

export interface MailgunConfig {
    apiKey: string;
    domain: string;
    url?: string;
}

export type ProviderConfig =
    | { provider: 'smtp'; config: SmtpConfig }
    | { provider: 'sendgrid'; config: SendGridConfig }
    | { provider: 'mailgun'; config: MailgunConfig };

export interface SendEmailPayload {
    provider: ProviderConfig['provider'];
    config: ProviderConfig['config'];
    message: EmailMessage;
}

export class EmailHubClient {
    private static getHeaders(): HeadersInit {
        return {
            'Content-Type': 'application/json',
            'x-api-key': EMAIL_API_KEY,
        };
    }

    /**
     * Send an email via the Email Hub
     */
    static async sendEmail(payload: SendEmailPayload): Promise<any> {
        if (!EMAIL_HUB_URL) {
            throw new Error('Email Hub URL not configured (VITE_EMAIL_URL)');
        }

        const response = await fetch(`${EMAIL_HUB_URL}/api/v1/email/send`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Email Hub Error: ${response.status} ${response.statusText}`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error) {
                    errorMessage = errorJson.error;
                }
                if (errorJson.details) {
                    errorMessage += ` - ${JSON.stringify(errorJson.details)}`;
                }
            } catch (e) {
                errorMessage += ` - ${errorText}`;
            }
            throw new Error(errorMessage);
        }

        return response.json();
    }

    /**
     * Verify connection with the email provider
     */
    static async verifyConnection(payload: ProviderConfig): Promise<boolean> {
        if (!EMAIL_HUB_URL) {
            throw new Error('Email Hub URL not configured (VITE_EMAIL_URL)');
        }

        const response = await fetch(`${EMAIL_HUB_URL}/api/v1/email/verify-connection`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Connection Verification Error: ${response.status} ${response.statusText}`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error) {
                    errorMessage = errorJson.error;
                }
                if (errorJson.details) {
                    errorMessage += ` - ${JSON.stringify(errorJson.details)}`;
                }
            } catch (e) {
                errorMessage += ` - ${errorText}`;
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();
        return result.success && result.valid;
    }
}
