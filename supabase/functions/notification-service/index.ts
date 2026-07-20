// Supabase Edge Function for handling notification delivery
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// Email sending service (example using a mock service)
const sendEmail = async (to: string, subject: string, body: string) => {
  console.log(`Sending email to ${to}: ${subject}`);
  // In a real implementation, you would use a service like SendGrid, Mailgun, etc.
  return { success: true };
};

// WebSocket notification (would be implemented with a real WebSocket service)
const sendWebSocketNotification = async (userId: string, notification: any) => {
  console.log(`Sending WebSocket notification to ${userId}`);
  // In a real implementation, you would use a WebSocket service
  return { success: true };
};

serve(async (req) => {
  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const { notification_id } = await req.json();

    if (!notification_id) {
      return new Response(
        JSON.stringify({ error: 'notification_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get notification details
    const { data: notification, error: notificationError } = await supabase
      .from('user_notifications')
      .select(`
        *,
        user:user_id (
          email
        ),
        preferences:user_notification_preferences!user_id (
          email_enabled,
          in_app_enabled,
          muted_until,
          muted_types
        )
      `)
      .eq('id', notification_id)
      .single();

    if (notificationError || !notification) {
      return new Response(
        JSON.stringify({ error: 'Notification not found', details: notificationError }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if notifications are muted
    const now = new Date();
    const preferences = notification.preferences;
    const isMuted = preferences.muted_until && new Date(preferences.muted_until) > now;
    const isTypeMuted = preferences.muted_types && preferences.muted_types.includes(notification.type);

    if (isMuted || isTypeMuted) {
      return new Response(
        JSON.stringify({ message: 'Notification delivery skipped due to user preferences' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Deliver notification via email if enabled
    if (preferences.email_enabled) {
      await sendEmail(
        notification.user.email,
        notification.title,
        notification.message
      );
    }

    // Deliver notification via WebSocket if enabled
    if (preferences.in_app_enabled) {
      await sendWebSocketNotification(notification.user_id, notification);
    }

    // Mark notification as delivered
    await supabase
      .from('user_notifications')
      .update({ delivered_at: new Date().toISOString() })
      .eq('id', notification_id);

    return new Response(
      JSON.stringify({ message: 'Notification delivered successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing notification:', error);
    
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});