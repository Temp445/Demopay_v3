/*
  # Work Location Assignment and Tracking System

  Creates tables and functions for GPS-based work location tracking with radius monitoring
*/

CREATE TABLE IF NOT EXISTS work_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES auth.users(id),

  location_name TEXT NOT NULL,
  location_description TEXT,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  allowed_radius_meters DECIMAL(10, 2) NOT NULL DEFAULT 100,

  assignment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  work_description TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'approved', 'cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),

  work_amount DECIMAL(10, 2),
  work_amount_unit TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_work_locations_employee ON work_locations(employee_id, tenant_id);
CREATE INDEX idx_work_locations_status ON work_locations(status, tenant_id);

CREATE TABLE IF NOT EXISTS work_location_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_location_id UUID NOT NULL REFERENCES work_locations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(10, 2),

  distance_from_center DECIMAL(10, 2),
  is_within_radius BOOLEAN DEFAULT true,

  recorded_at TIMESTAMPTZ DEFAULT now(),
  battery_level INTEGER,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tracking_work_location ON work_location_tracking(work_location_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS work_location_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_location_id UUID NOT NULL REFERENCES work_locations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  violation_type TEXT NOT NULL DEFAULT 'radius_exit',
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  distance_from_center DECIMAL(10, 2) NOT NULL,

  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ,

  violated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_violations_work_location ON work_location_violations(work_location_id, violated_at DESC);

CREATE TABLE IF NOT EXISTS work_location_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_location_id UUID REFERENCES work_locations(id) ON DELETE CASCADE,

  recipient_user_id UUID REFERENCES auth.users(id),
  recipient_employee_id UUID REFERENCES employees(id),

  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'work_assigned', 'work_started', 'work_completed', 'radius_violation', 'work_approved'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,

  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wl_notifications_recipient ON work_location_notifications(recipient_user_id, is_read, created_at DESC);

ALTER TABLE work_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_location_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_location_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_location_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view work locations in tenant" ON work_locations FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can create work locations in tenant" ON work_locations FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can update work locations in tenant" ON work_locations FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can view tracking in tenant" ON work_location_tracking FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert tracking in tenant" ON work_location_tracking FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can view violations in tenant" ON work_location_violations FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert violations in tenant" ON work_location_violations FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can update violations in tenant" ON work_location_violations FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own wl notifications" ON work_location_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() OR recipient_employee_id IN (
    SELECT e.id FROM employees e JOIN profiles p ON e.email = p.email WHERE p.id = auth.uid()
  ));

CREATE POLICY "Users can insert wl notifications in tenant" ON work_location_notifications FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own wl notifications" ON work_location_notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid() OR recipient_employee_id IN (
    SELECT e.id FROM employees e JOIN profiles p ON e.email = p.email WHERE p.id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION calculate_distance(lat1 DECIMAL, lon1 DECIMAL, lat2 DECIMAL, lon2 DECIMAL) RETURNS DECIMAL AS $$
DECLARE
  earth_radius DECIMAL := 6371000; dlat DECIMAL; dlon DECIMAL; a DECIMAL; c DECIMAL;
BEGIN
  dlat := radians(lat2 - lat1); dlon := radians(lon2 - lon1);
  a := sin(dlat/2) * sin(dlat/2) + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2) * sin(dlon/2);
  c := 2 * atan2(sqrt(a), sqrt(1-a));
  RETURN ROUND(earth_radius * c, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION is_within_radius(work_location_id_param UUID, current_lat DECIMAL, current_lon DECIMAL) RETURNS BOOLEAN AS $$
DECLARE location_record RECORD; distance DECIMAL;
BEGIN
  SELECT latitude, longitude, allowed_radius_meters INTO location_record FROM work_locations WHERE id = work_location_id_param;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  distance := calculate_distance(location_record.latitude, location_record.longitude, current_lat, current_lon);
  RETURN distance <= location_record.allowed_radius_meters;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_work_location_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_locations_updated_at BEFORE UPDATE ON work_locations
  FOR EACH ROW EXECUTE FUNCTION update_work_location_updated_at();

CREATE OR REPLACE FUNCTION notify_work_assignment() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO work_location_notifications (tenant_id, work_location_id, recipient_employee_id, notification_type, title, message)
  SELECT NEW.tenant_id, NEW.id, NEW.employee_id, 'work_assigned', 'New Work Location Assigned',
    'You have been assigned to work at ' || NEW.location_name || ' on ' || NEW.assignment_date::TEXT;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_location_assigned AFTER INSERT ON work_locations
  FOR EACH ROW EXECUTE FUNCTION notify_work_assignment();

CREATE OR REPLACE FUNCTION check_radius_violation() RETURNS TRIGGER AS $$
DECLARE location_record RECORD; is_within BOOLEAN; last_violation RECORD;
BEGIN
  SELECT * INTO location_record FROM work_locations WHERE id = NEW.work_location_id AND status = 'in_progress';
  IF NOT FOUND THEN RETURN NEW; END IF;
  
  is_within := is_within_radius(NEW.work_location_id, NEW.latitude, NEW.longitude);
  NEW.is_within_radius := is_within;
  
  IF NOT is_within THEN
    SELECT * INTO last_violation FROM work_location_violations
    WHERE work_location_id = NEW.work_location_id AND violation_type = 'radius_exit'
      AND violated_at > now() - INTERVAL '5 minutes' ORDER BY violated_at DESC LIMIT 1;
    
    IF NOT FOUND THEN
      INSERT INTO work_location_violations (tenant_id, work_location_id, employee_id, violation_type, latitude, longitude, distance_from_center)
      VALUES (NEW.tenant_id, NEW.work_location_id, NEW.employee_id, 'radius_exit', NEW.latitude, NEW.longitude, NEW.distance_from_center);
      
      INSERT INTO work_location_notifications (tenant_id, work_location_id, recipient_user_id, notification_type, title, message)
      SELECT NEW.tenant_id, NEW.work_location_id, location_record.assigned_by, 'radius_violation', 'Work Location Violation',
        (SELECT name FROM employees WHERE id = NEW.employee_id) || ' has exited the allowed radius';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tracking_radius_check BEFORE INSERT ON work_location_tracking
  FOR EACH ROW EXECUTE FUNCTION check_radius_violation();