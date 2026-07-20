/*
  # Enhance Leave Types with Comprehensive Leave Management

  1. New Fields Added to leave_types table
    - Leave Credit Policy fields
      - credit_policy_type: 'earned' or 'fixed'
      - earned_initial_credit: number
      - earned_days_to_work: number
      - earned_days_credited: number
      - fixed_credit_frequency: 'monthly' or 'yearly'
    
    - Leave Carry Forward fields
      - carry_forward_type: 'carry_forward' or 'elapsed'
      - carry_forward_frequency: 'monthly' or 'yearly'
      - carry_forward_min_limit: number
      - carry_forward_max_limit: number
    
    - Leave Occurrence fields
      - min_days_per_occurrence: number
      - max_days_per_occurrence: number
      - gap_between_occurrences: number
      - max_occasions: number
    
    - Leave Encashment fields
      - encashment_applicable: boolean
      - encashment_min_limit: number
      - encashment_max_limit: number
      - encashment_frequency: 'monthly' or 'yearly'

  2. Changes
    - Add new columns to leave_types table
    - Set appropriate default values
    - Maintain backward compatibility
*/

-- Add Leave Credit Policy fields
ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS credit_policy_type text DEFAULT 'fixed' CHECK (credit_policy_type IN ('earned', 'fixed'));

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS earned_initial_credit numeric DEFAULT 0;

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS earned_days_to_work numeric DEFAULT 0;

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS earned_days_credited numeric DEFAULT 0;

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS fixed_credit_frequency text DEFAULT 'yearly' CHECK (fixed_credit_frequency IN ('monthly', 'yearly'));

-- Add Leave Carry Forward fields
ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS carry_forward_type text DEFAULT 'elapsed' CHECK (carry_forward_type IN ('carry_forward', 'elapsed'));

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS carry_forward_frequency text DEFAULT 'yearly' CHECK (carry_forward_frequency IN ('monthly', 'yearly'));

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS carry_forward_min_limit numeric DEFAULT 0;

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS carry_forward_max_limit numeric DEFAULT 0;

-- Add Leave Occurrence fields
ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS min_days_per_occurrence numeric DEFAULT 0.5;

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS max_days_per_occurrence numeric DEFAULT 30;

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS gap_between_occurrences numeric DEFAULT 0;

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS max_occasions numeric DEFAULT 999;

-- Add Leave Encashment fields
ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS encashment_applicable boolean DEFAULT false;

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS encashment_min_limit numeric DEFAULT 0;

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS encashment_max_limit numeric DEFAULT 0;

ALTER TABLE leave_types 
ADD COLUMN IF NOT EXISTS encashment_frequency text DEFAULT 'yearly' CHECK (encashment_frequency IN ('monthly', 'yearly'));

-- Add comment for documentation
COMMENT ON COLUMN leave_types.credit_policy_type IS 'Leave credit policy: earned (based on working days) or fixed (periodic credit)';
COMMENT ON COLUMN leave_types.carry_forward_type IS 'Carry forward behavior: carry_forward (allow balance transfer) or elapsed (expire unused balance)';
COMMENT ON COLUMN leave_types.encashment_applicable IS 'Whether leave encashment is allowed for this leave type';
COMMENT ON COLUMN leave_types.gap_between_occurrences IS 'Minimum days required between consecutive leave applications';
COMMENT ON COLUMN leave_types.max_occasions IS 'Maximum number of times this leave can be availed in a period';
