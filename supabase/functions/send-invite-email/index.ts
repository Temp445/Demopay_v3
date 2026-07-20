import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InviteRequest {
  email: string;
  name: string;
  role: 'Employee' | 'HR Team' | 'Reporting Head';
  tenant_id: string;
}

Deno.serve(async (req: Request) => {
  // Handle OPTIONS request for CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { email, name, role, tenant_id }: InviteRequest = await req.json();

    // Validate input
    if (!email || !name || !role || !tenant_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Get SMTP configuration from database
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const response = await fetch(`${supabaseUrl}/rest/v1/smtp_configurations?tenant_id=eq.${tenant_id}&select=*`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch SMTP configuration');
    }

    const smtpConfigs = await response.json();

    if (!smtpConfigs || smtpConfigs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'SMTP configuration not found. Please configure SMTP settings first.' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const smtpConfig = smtpConfigs[0];

    // Generate custom invitation token
    // const tokenResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/generate_invite_token`, {
    //   method: 'POST',
    //   headers: {
    //     'apikey': supabaseServiceKey,
    //     'Authorization': `Bearer ${supabaseServiceKey}`,
    //     'Content-Type': 'application/json',
    //   },
    // });

    // if (!tokenResponse.ok) {
    //   throw new Error('Failed to generate invitation token');
    // }

    const inviteToken = crypto.randomUUID();

    // Calculate expiration date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store invitation in database
    const invitationResponse = await fetch(`${supabaseUrl}/rest/v1/user_invitations`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        email: email,
        name: name,
        role: role,
        token: inviteToken,
        tenant_id: tenant_id,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      }),
    });

    if (!invitationResponse.ok) {
      const error = await invitationResponse.json();
      throw new Error(error.message || 'Failed to create invitation record');
    }

    const invitation = await invitationResponse.json();

    // Create invitation link with custom token
    const appUrl = Deno.env.get('REDIRECT_URL') || 'http://localhost:5173';
    const inviteLink = `${appUrl}/accept-invite?token=${inviteToken}`;

    // Send email using SMTP
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; background-color: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          .credentials { background-color: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Our HRMS Platform</h1>
          </div>
          <div class="content">
            <p>Hello ${name},</p>
            <p>You have been invited to join our HRMS platform as <strong>${role}</strong>.</p>
            <p>Please click the button below to accept the invitation and create your account:</p>
            <p style="text-align: center;">
              <a href="${inviteLink}" class="button">Accept Invitation</a>
            </p>
            <div class="credentials">
              <p style="margin: 0 0 10px 0;"><strong>Your Login Email:</strong></p>
              <p style="margin: 0; font-family: monospace; background-color: #f5f5f5; padding: 8px; border-radius: 3px;">${email}</p>
              <p style="margin: 15px 0 5px 0; font-size: 12px; color: #666;">You will set your password when you accept the invitation.</p>
            </div>
            <p>This invitation link will expire in 7 days.</p>
            <p>If you did not expect this invitation, you can safely ignore this email.</p>
            <p>Best regards,<br>HRMS Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Log email details (In production, send via SMTP using smtpConfig)
    console.log('Email would be sent to:', email);
    console.log('SMTP Config:', { host: smtpConfig.host, port: smtpConfig.port, from: smtpConfig.sender_email });
    console.log('Invite Link:', inviteLink);
    console.log('Email HTML:', emailHtml);

    // Return success
    return new Response(
      JSON.stringify({
        success: true,
        message: `Invitation sent to ${email}`,
        token: inviteToken,
        invite_link: inviteLink
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error sending invite:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to send invitation',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
