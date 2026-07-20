/*
  # Add Notification System

  1. New Tables
    - `user_notifications`
      - Stores all user notifications
      - Tracks read status and notification metadata
    - `user_notification_preferences`
      - Stores user preferences for notifications
      - Controls email, in-app, and muted settings

  2. Security
    - Enable RLS on both tables
    - Add policies for user-specific access
    - Ensure users can only access their own notifications

  3. Indexes
    - Add indexes for efficient querying
    - Optimize for unread notification counts
*/

-- Create notification type enum
CREATE TYPE public.notification_type AS ENUM (
  'payroll_processed',
  'payroll_deadline',
  'salary_change',
  'benefit_change',
  'leave_approved',
  'leave_rejected',
  'attendance_issue',
  'system_update'
);

-- Create user notifications table
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  data jsonb DEFAULT NULL,
  link text DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user notification preferences table
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email_enabled boolean DEFAULT true,
  in_app_enabled boolean DEFAULT true,
  muted_until timestamptz DEFAULT NULL,
  muted_types notification_type[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_user_notifications_user_id ON public.user_notifications(user_id);
CREATE INDEX idx_user_notifications_is_read ON public.user_notifications(is_read);
CREATE INDEX idx_user_notifications_created_at ON public.user_notifications(created_at);
CREATE INDEX idx_user_notification_preferences_user_id ON public.user_notification_preferences(user_id);

-- Enable RLS
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_notifications
CREATE POLICY "Users can view their own notifications"
  ON public.user_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.user_notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
  ON public.user_notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create RLS policies for user_notification_preferences
CREATE POLICY "Users can view their own notification preferences"
  ON public.user_notification_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification preferences"
  ON public.user_notification_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Add updated_at triggers
CREATE TRIGGER user_notifications_updated_at
  BEFORE UPDATE ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER user_notification_preferences_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create function to initialize notification preferences for new users
CREATE OR REPLACE FUNCTION public.initialize_notification_preferences()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_notification_preferences (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to initialize notification preferences for new users
CREATE TRIGGER initialize_notification_preferences_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_notification_preferences();

-- Create function to send notification
CREATE OR REPLACE FUNCTION public.send_notification(
  p_user_id uuid,
  p_type notification_type,
  p_title text,
  p_message text,
  p_data jsonb DEFAULT NULL,
  p_link text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_preferences record;
BEGIN
  -- Check if user has muted this notification type
  SELECT * INTO v_preferences
  FROM public.user_notification_preferences
  WHERE user_id = p_user_id;
  
  -- Skip if notifications are muted
  IF v_preferences.muted_until IS NOT NULL AND v_preferences.muted_until > now() THEN
    RETURN NULL;
  END IF;
  
  -- Skip if this notification type is muted
  IF p_type = ANY(v_preferences.muted_types) THEN
    RETURN NULL;
  END IF;
  
  -- Insert notification
  INSERT INTO public.user_notifications (
    user_id,
    type,
    title,
    message,
    data,
    link
  ) VALUES (
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_data,
    p_link
  ) RETURNING id INTO v_notification_id;
  
  -- Return the notification ID
  RETURN v_notification_id;
END;
$$;

-- Create function to send notification to multiple users
CREATE OR REPLACE FUNCTION public.send_notification_to_users(
  p_user_ids uuid[],
  p_type notification_type,
  p_title text,
  p_message text,
  p_data jsonb DEFAULT NULL,
  p_link text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Send notification to each user
  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
    PERFORM public.send_notification(
      v_user_id,
      p_type,
      p_title,
      p_message,
      p_data,
      p_link
    );
  END LOOP;
END;
$$;

-- Create function to send notification to all users
CREATE OR REPLACE FUNCTION public.send_notification_to_all_users(
  p_type notification_type,
  p_title text,
  p_message text,
  p_data jsonb DEFAULT NULL,
  p_link text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_ids uuid[];
BEGIN
  -- Get all user IDs
  SELECT array_agg(id) INTO v_user_ids
  FROM auth.users;
  
  -- Send notification to all users
  PERFORM public.send_notification_to_users(
    v_user_ids,
    p_type,
    p_title,
    p_message,
    p_data,
    p_link
  );
END;
$$;

-- Create trigger to send notification when payroll is processed
CREATE OR REPLACE FUNCTION public.notify_payroll_processed()
RETURNS trigger AS $$
BEGIN
  -- Only trigger on status change to 'Paid'
  IF NEW.status = 'Paid' AND (OLD.status IS NULL OR OLD.status <> 'Paid') THEN
    -- Get employee details
    DECLARE
      v_employee_name text;
      v_employee_user_id uuid;
    BEGIN
      SELECT name, user_id INTO v_employee_name, v_employee_user_id
      FROM public.employees
      WHERE id = NEW.employee_id;
      
      -- Send notification to employee
      IF v_employee_user_id IS NOT NULL THEN
        PERFORM public.send_notification(
          v_employee_user_id,
          'payroll_processed'::notification_type,
          'Payroll Processed',
          'Your salary for the period ' || NEW.period_start || ' to ' || NEW.period_end || ' has been processed.',
          jsonb_build_object(
            'amount', NEW.total_amount,
            'period_start', NEW.period_start,
            'period_end', NEW.period_end
          ),
          '/dashboard/payroll'
        );
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for payroll notifications
CREATE TRIGGER notify_payroll_processed_trigger
  AFTER INSERT OR UPDATE ON public.payroll
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_payroll_processed();

-- Create trigger to send notification when leave request is approved/rejected
CREATE OR REPLACE FUNCTION public.notify_leave_request_status()
RETURNS trigger AS $$
BEGIN
  -- Only trigger on status change
  IF NEW.status <> OLD.status THEN
    -- Get employee details
    DECLARE
      v_employee_user_id uuid;
      v_leave_type_name text;
    BEGIN
      SELECT user_id INTO v_employee_user_id
      FROM public.employees
      WHERE id = NEW.employee_id;
      
      SELECT name INTO v_leave_type_name
      FROM public.leave_types
      WHERE id = NEW.leave_type_id;
      
      -- Send notification to employee
      IF v_employee_user_id IS NOT NULL THEN
        IF NEW.status = 'Approved' THEN
          PERFORM public.send_notification(
            v_employee_user_id,
            'leave_approved'::notification_type,
            'Leave Request Approved',
            'Your ' || v_leave_type_name || ' request from ' || NEW.start_date || ' to ' || NEW.end_date || ' has been approved.',
            jsonb_build_object(
              'leave_type', v_leave_type_name,
              'start_date', NEW.start_date,
              'end_date', NEW.end_date
            ),
            '/dashboard/leave'
          );
        ELSIF NEW.status = 'Rejected' THEN
          PERFORM public.send_notification(
            v_employee_user_id,
            'leave_rejected'::notification_type,
            'Leave Request Rejected',
            'Your ' || v_leave_type_name || ' request from ' || NEW.start_date || ' to ' || NEW.end_date || ' has been rejected.',
            jsonb_build_object(
              'leave_type', v_leave_type_name,
              'start_date', NEW.start_date,
              'end_date', NEW.end_date
            ),
            '/dashboard/leave'
          );
        END IF;
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for leave request notifications
CREATE TRIGGER notify_leave_request_status_trigger
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_leave_request_status();

-- Create trigger to send notification when salary structure changes
CREATE OR REPLACE FUNCTION public.notify_salary_structure_change()
RETURNS trigger AS $$
BEGIN
  -- Get employee details
  DECLARE
    v_employee_user_id uuid;
    v_structure_name text;
  BEGIN
    SELECT user_id INTO v_employee_user_id
    FROM public.employees
    WHERE id = NEW.employee_id;
    
    SELECT name INTO v_structure_name
    FROM public.salary_structures
    WHERE id = NEW.structure_id;
    
    -- Send notification to employee
    IF v_employee_user_id IS NOT NULL THEN
      PERFORM public.send_notification(
        v_employee_user_id,
        'salary_change'::notification_type,
        'Salary Structure Updated',
        'Your salary structure has been updated to ' || v_structure_name || ' effective from ' || NEW.effective_from || '.',
        jsonb_build_object(
          'structure_name', v_structure_name,
          'effective_from', NEW.effective_from,
          'effective_to', NEW.effective_to
        ),
        '/dashboard/salary-structures'
      );
    END IF;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for salary structure change notifications
CREATE TRIGGER notify_salary_structure_change_trigger
  AFTER INSERT ON public.employee_salary_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_salary_structure_change();