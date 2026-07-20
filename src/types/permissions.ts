export type PermissionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface EmployeePermission {
  id: string;
  tenantId: string;
  employeeId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  reason: string;
  status: PermissionStatus;
  requestedBy: string;
  approvedBy?: string;
  approvalDate?: string;
  createdAt: string;
  updatedAt: string;

  employeeName?: string;
  employeeCode?: string;
  requestedByName?: string;
  approvedByName?: string;
}

export interface EmployeePermissionLog {
  id: string;
  permissionId: string;
  modifiedBy: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  modifiedAt: string;

  modifiedByName?: string;
}

export interface CreatePermissionRequest {
  employeeId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  reason: string;
}

export interface UpdatePermissionRequest {
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  reason?: string;
  status?: PermissionStatus;
  approvedBy?: string;
  approvalDate?: string;
}
