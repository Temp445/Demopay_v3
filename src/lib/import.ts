import { supabase } from './supabase';
import * as XLSX from 'xlsx';
import { getTenantId } from './tenantDb';

export interface ImportResult {
  success: boolean;
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  errors: ImportError[];
  warnings: string[];
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  data?: any;
}

export interface ImportValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'date' | 'email' | 'boolean';
  maxLength?: number;
  minLength?: number;
  pattern?: RegExp;
  customValidator?: (value: any, row: any) => string | null;
}

// Validation rules for each entity
const validationRules: Record<string, ImportValidationRule[]> = {
  employees: [
    { field: 'name', required: true, type: 'string', minLength: 2, maxLength: 100 },
    { field: 'email', required: true, type: 'email', maxLength: 255 },
    { field: 'cadre', required: true, type: 'string', maxLength: 100 },
    { field: 'department', required: true, type: 'string', maxLength: 100 },
    { field: 'role', required: true, type: 'string', maxLength: 100 },
    { field: 'status', required: true, type: 'string', customValidator: (value) => {
      const validStatuses = ['Active', 'On Leave', 'Terminated'];
      return validStatuses.includes(value) ? null : `Status must be one of: ${validStatuses.join(', ')}`;
    }},
    { field: 'start_date', required: true, type: 'date' },
    { field: 'employee_code', required: false, type: 'string', maxLength: 50 },
    { field: 'address', required: false, type: 'string', maxLength: 500 },
    { field: 'date_of_birth', required: false, type: 'date', customValidator: (value) => {
      if (value && new Date(value) > new Date()) {
        return 'Date of birth cannot be in the future';
      }
      return null;
    }},
    { field: 'father_name', required: false, type: 'string', maxLength: 100 },
    { field: 'uan_number', required: false, type: 'string', maxLength: 50 },
    { field: 'contact_number', required: false, type: 'string', maxLength: 20 }
  ],
  departments: [
    { field: 'name', required: true, type: 'string', minLength: 2, maxLength: 100 }
  ],
  roles: [
    { field: 'name', required: true, type: 'string', minLength: 2, maxLength: 100 }
  ],
  leave_types: [
    { field: 'name', required: true, type: 'string', minLength: 2, maxLength: 100 },
    { field: 'description', required: false, type: 'string', maxLength: 500 },
    { field: 'default_days', required: true, type: 'number', customValidator: (value) => {
      return value >= 0 ? null : 'Default days must be 0 or greater';
    }},
    { field: 'requires_approval', required: false, type: 'boolean' },
    { field: 'is_active', required: false, type: 'boolean' },
    { field: 'is_paid', required: false, type: 'boolean' }
  ],
  holidays: [
    { field: 'name', required: true, type: 'string', minLength: 2, maxLength: 100 },
    { field: 'date', required: true, type: 'date' },
    { field: 'holiday_type', required: true, type: 'string', customValidator: (value) => {
      const validTypes = ['public', 'company'];
      return validTypes.includes(value) ? null : `Holiday type must be one of: ${validTypes.join(', ')}`;
    }},
    { field: 'description', required: false, type: 'string', maxLength: 500 },
    { field: 'is_recurring', required: false, type: 'boolean' }
  ],
  shifts: [
    { field: 'name', required: true, type: 'string', minLength: 2, maxLength: 100 },
    { field: 'description', required: false, type: 'string', maxLength: 500 },
    { field: 'start_time', required: true, type: 'string', pattern: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    { field: 'end_time', required: true, type: 'string', pattern: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    { field: 'break_start_time', required: true, type: 'string', pattern: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    { field: 'break_end_time', required: true, type: 'string', pattern: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    { field: 'shift_type', required: true, type: 'string', customValidator: (value) => {
      const validTypes = ['morning', 'afternoon', 'night'];
      return validTypes.includes(value) ? null : `Shift type must be one of: ${validTypes.join(', ')}`;
    }},
    { field: 'is_active', required: false, type: 'boolean' }
  ],
  payroll_components: [
    { field: 'name', required: true, type: 'string', minLength: 2, maxLength: 100 },
    { field: 'description', required: false, type: 'string', maxLength: 500 },
    { field: 'component_type', required: true, type: 'string', customValidator: (value) => {
      const validTypes = ['earning', 'deduction'];
      return validTypes.includes(value) ? null : `Component type must be one of: ${validTypes.join(', ')}`;
    }},
    { field: 'is_active', required: false, type: 'boolean' }
  ]
};

// Parse file based on format
export async function parseImportFile(file: File): Promise<any[]> {
  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  
  switch (fileExtension) {
    case 'csv':
      return parseCSV(file);
    case 'xlsx':
    case 'xls':
      return parseExcel(file);
    case 'json':
      return parseJSON(file);
    default:
      throw new Error('Unsupported file format. Please use CSV, Excel (.xlsx), or JSON files.');
  }
}

// Parse CSV file
async function parseCSV(file: File): Promise<any[]> {
  const text = await file.text();
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV file must contain at least a header row and one data row');
  }
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    data.push(row);
  }
  
  return data;
}

// Parse CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// Parse Excel file
async function parseExcel(file: File): Promise<any[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  return XLSX.utils.sheet_to_json(worksheet, { header: 1 }).slice(1).map((row: any) => {
    const headers = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[];
    const rowData: any = {};
    
    headers.forEach((header, index) => {
      rowData[header] = row[index] || '';
    });
    
    return rowData;
  });
}

// Parse JSON file
async function parseJSON(file: File): Promise<any[]> {
  const text = await file.text();
  const data = JSON.parse(text);
  
  if (!Array.isArray(data)) {
    throw new Error('JSON file must contain an array of objects');
  }
  
  return data;
}

// Validate data against rules
export function validateImportData(data: any[], entityType: string): ImportError[] {
  const rules = validationRules[entityType];
  if (!rules) {
    throw new Error(`No validation rules defined for entity type: ${entityType}`);
  }
  
  const errors: ImportError[] = [];
  
  data.forEach((row, index) => {
    rules.forEach(rule => {
      const value = row[rule.field];
      const rowNumber = index + 2; // +2 because index is 0-based and we skip header
      
      // Check required fields
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({
          row: rowNumber,
          field: rule.field,
          message: `${rule.field} is required`
        });
        return;
      }
      
      // Skip validation for empty optional fields
      if (!rule.required && (value === undefined || value === null || value === '')) {
        return;
      }
      
      // Type validation
      if (rule.type && value !== '') {
        switch (rule.type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push({
                row: rowNumber,
                field: rule.field,
                message: `${rule.field} must be a string`
              });
            }
            break;
          case 'number':
            if (isNaN(Number(value))) {
              errors.push({
                row: rowNumber,
                field: rule.field,
                message: `${rule.field} must be a number`
              });
            }
            break;
          case 'date':
            if (isNaN(Date.parse(value))) {
              errors.push({
                row: rowNumber,
                field: rule.field,
                message: `${rule.field} must be a valid date`
              });
            }
            break;
          case 'email':
            if (!/^\S+@\S+\.\S+$/.test(value)) {
              errors.push({
                row: rowNumber,
                field: rule.field,
                message: `${rule.field} must be a valid email address`
              });
            }
            break;
          case 'boolean':
            const boolValue = value.toString().toLowerCase();
            if (!['true', 'false', '1', '0', 'yes', 'no'].includes(boolValue)) {
              errors.push({
                row: rowNumber,
                field: rule.field,
                message: `${rule.field} must be a boolean value (true/false, yes/no, 1/0)`
              });
            }
            break;
        }
      }
      
      // Length validation
      if (rule.minLength && value.length < rule.minLength) {
        errors.push({
          row: rowNumber,
          field: rule.field,
          message: `${rule.field} must be at least ${rule.minLength} characters long`
        });
      }
      
      if (rule.maxLength && value.length > rule.maxLength) {
        errors.push({
          row: rowNumber,
          field: rule.field,
          message: `${rule.field} must be no more than ${rule.maxLength} characters long`
        });
      }
      
      // Pattern validation
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push({
          row: rowNumber,
          field: rule.field,
          message: `${rule.field} format is invalid`
        });
      }
      
      // Custom validation
      if (rule.customValidator) {
        const customError = rule.customValidator(value, row);
        if (customError) {
          errors.push({
            row: rowNumber,
            field: rule.field,
            message: customError
          });
        }
      }
    });
  });
  
  return errors;
}

const normalizeKey = (key) =>
  key
    .toLowerCase()
    .replace(/\s+/g, "_")   // spaces → _
    .replace(/[^\w]/g, ""); // remove special chars
  
// Convert boolean values from various formats
function convertBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  const stringValue = value.toString().toLowerCase();
  return ['true', '1', 'yes', 'y'].includes(stringValue);
}

// Import employees
export async function importEmployees(data: any[], userId: string): Promise<ImportResult> {
  const errors: ImportError[] = [];
  let successfulRecords = 0;
  const warnings: string[] = [];
  
 
  const normalizedData = data.map(row => {
    const newRow = {};

    Object.keys(row).forEach(key => {
      newRow[normalizeKey(key)] = row[key];
    });

    return newRow;
  });


  // Validate data first
  const validationErrors = validateImportData(normalizedData, 'employees');
  if (validationErrors.length > 0) {
    return {
      success: false,
      totalRecords: data.length,
      successfulRecords: 0,
      failedRecords: data.length,
      errors: validationErrors,
      warnings
    };
  }
  
  // Check for existing emails and employee codes
  const emails = normalizedData.map(row => row.email).filter(Boolean);
  const employeeCodes = normalizedData.map(row => row.employee_code).filter(Boolean);
  const tenantId = await getTenantId();

  if (emails.length > 0) {
    const { data: existingEmails } = await supabase
      .from('employees')
      .select('email')
      .eq('tenant_id', tenantId)
      .in('email', emails);
    
    if (existingEmails && existingEmails.length > 0) {
      existingEmails.forEach(existing => {
        const rowIndex = normalizedData.findIndex(row => row.email === existing.email);
        if (rowIndex !== -1) {
          errors.push({
            row: rowIndex + 2,
            field: 'email',
            message: `Email ${existing.email} already exists`
          });
        }
      });
    }
  }
  
  if (employeeCodes.length > 0) {
    const { data: existingCodes } = await supabase
      .from('employees')
      .select('employee_code')
      .eq('tenant_id', tenantId)
      .in('employee_code', employeeCodes);
    
    if (existingCodes && existingCodes.length > 0) {
      existingCodes.forEach(existing => {
        const rowIndex = normalizedData.findIndex(row => row.employee_code === existing.employee_code);
        if (rowIndex !== -1) {
          errors.push({
            row: rowIndex + 2,
            field: 'employee_code',
            message: `Employee code ${existing.employee_code} already exists`
          });
        }
      });
    }
  }
  
  // Process each row
  for (let i = 0; i < normalizedData.length; i++) {
    const row = normalizedData[i];
    const rowNumber = i + 2;
    
    // Skip rows with validation errors
    if (errors.some(error => error.row === rowNumber)) {
      continue;
    }
    
    try {

      /* ---------- CADRE (INSERT ONLY IF NOT EXISTS, GET ID) ---------- */
      const { data: existingCadre, error: cadFetchError } = await supabase
        .from('cadres')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', row.cadre)
        .maybeSingle();

      if (cadFetchError) {
        errors.push({
          row: rowNumber,
          field: 'cadre',
          message: cadFetchError.message
        });
        continue;
      }

      let cadreId: string;

      if (!existingCadre) {
        const { data: newCadre, error: cadInsertError } = await supabase
          .from('cadres')
          .insert({
            name: row.cadre,
            tenant_id: tenantId
          })
          .select('id')
          .single();

        if (cadInsertError || !newCadre) {
          errors.push({
            row: rowNumber,
            field: 'cadre',
            message: cadInsertError?.message || 'Failed to create department'
          });
          continue;
        }
        cadreId = newCadre.id;
      } else {
        cadreId = existingCadre.id;
      }
      
      /* ---------- DEPARTMENT (INSERT ONLY IF NOT EXISTS, GET ID) ---------- */
      const { data: existingDepartment, error: depFetchError } = await supabase
        .from('departments')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', row.department)
        .maybeSingle();

      if (depFetchError) {
        errors.push({
          row: rowNumber,
          field: 'department',
          message: depFetchError.message
        });
        continue;
      }

      let departmentId: string;

      if (!existingDepartment) {
        const { data: newDepartment, error: depInsertError } = await supabase
          .from('departments')
          .insert({
            name: row.department,
            tenant_id: tenantId
          })
          .select('id')
          .single();

        if (depInsertError || !newDepartment) {
          errors.push({
            row: rowNumber,
            field: 'department',
            message: depInsertError?.message || 'Failed to create department'
          });
          continue;
        }
        departmentId = newDepartment.id;
      } else {
        departmentId = existingDepartment.id;
      }

      /* ---------- ROLE (INSERT ONLY IF NOT EXISTS, GET ID) ---------- */
      const { data: existingRole, error: roleFetchError } = await supabase
        .from('roles')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', row.role)
        .maybeSingle();

      if (roleFetchError) {
        errors.push({
          row: rowNumber,
          field: 'role',
          message: roleFetchError.message
        });
        continue;
      }

      let roleId: string;

      if (!existingRole) {
        const { data: newRole, error: roleInsertError } = await supabase
          .from('roles')
          .insert({
            name: row.role,
            tenant_id: tenantId
          })
          .select('id')
          .single();

        if (roleInsertError || !newRole) {
          errors.push({
            row: rowNumber,
            field: 'role',
            message: roleInsertError?.message || 'Failed to create role'
          });
          continue;
        }
        roleId = newRole.id;
      } else {
        roleId = existingRole.id;
      }

      /* Insert Employee Table with Foreign Keys */
      const employeeData = {
        name: row.name,
        email: row.email,
        cadre_id: cadreId,
        department_id: departmentId,
        role_id: roleId,
        status: row.status || 'Active',
        start_date: row.start_date,
        employee_code: row.employee_code || null,
        address: row.address || null,
        date_of_birth: row.date_of_birth || null,
        father_name: row.father_name || null,
        uan_number: row.uan_number || null,
        contact_number: row.contact_number || null,
        created_by: userId,
        tenant_id: tenantId
      };
      
      const { error } = await supabase
        .from('employees')
        .insert([employeeData]);
      
      if (error) {
        errors.push({
          row: rowNumber,
          message: error.message,
          data: row
        });
      } else {
        successfulRecords++;
      }
    } catch (err) {
      errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        data: row
      });
    }
  }
  
  return {
    success: errors.length === 0,
    totalRecords: data.length,
    successfulRecords,
    failedRecords: data.length - successfulRecords,
    errors,
    warnings
  };
}

// Import departments
export async function importDepartments(data: any[]): Promise<ImportResult> {
  const errors: ImportError[] = [];
  let successfulRecords = 0;
  const warnings: string[] = [];
  
  const normalizedData = data.map(row => {
    const newRow = {};

    Object.keys(row).forEach(key => {
      newRow[normalizeKey(key)] = row[key];
    });

    return newRow;
  });

  // Validate data first
  const validationErrors = validateImportData(normalizedData, 'departments');
  if (validationErrors.length > 0) {
    return {
      success: false,
      totalRecords: data.length,
      successfulRecords: 0,
      failedRecords: data.length,
      errors: validationErrors,
      warnings
    };
  }
  
  const tenantId = await getTenantId();

  // Check for existing department names
  const names = normalizedData.map(row => row.name);
  const { data: existingDepts } = await supabase
    .from('departments')
    .select('name')
    .eq('tenant_id', tenantId)
    .in('name', names);
  
  if (existingDepts && existingDepts.length > 0) {
    existingDepts.forEach(existing => {
      const rowIndex = normalizedData.findIndex(row => row.name === existing.name);
      if (rowIndex !== -1) {
        errors.push({
          row: rowIndex + 2,
          field: 'name',
          message: `Department ${existing.name} already exists`
        });
      }
    });
  }
  
  // Process each row
  for (let i = 0; i < normalizedData.length; i++) {
    const row = normalizedData[i];
    const rowNumber = i + 2;
    
    // Skip rows with validation errors
    if (errors.some(error => error.row === rowNumber)) {
      continue;
    }
    
    try {
      const { error } = await supabase
        .from('departments')
        .insert([{ name: row.name, tenant_id: tenantId }]);
      
      if (error) {
        errors.push({
          row: rowNumber,
          message: error.message,
          data: row
        });
      } else {
        successfulRecords++;
      }
    } catch (err) {
      errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        data: row
      });
    }
  }
  
  return {
    success: errors.length === 0,
    totalRecords: data.length,
    successfulRecords,
    failedRecords: data.length - successfulRecords,
    errors,
    warnings
  };
}

// Import roles
export async function importRoles(data: any[]): Promise<ImportResult> {
  const errors: ImportError[] = [];
  let successfulRecords = 0;
  const warnings: string[] = [];
  
  const normalizedData = data.map(row => {
    const newRow = {};

    Object.keys(row).forEach(key => {
      newRow[normalizeKey(key)] = row[key];
    });

    return newRow;
  });

  // Validate data first
  const validationErrors = validateImportData(normalizedData, 'roles');
  if (validationErrors.length > 0) {
    return {
      success: false,
      totalRecords: data.length,
      successfulRecords: 0,
      failedRecords: data.length,
      errors: validationErrors,
      warnings
    };
  }
  
  const tenantId = await getTenantId();

  // Check for existing role names
  const names = normalizedData.map(row => row.name);
  const { data: existingRoles } = await supabase
    .from('roles')
    .select('name')
    .eq('tenant_id', tenantId)
    .in('name', names);
  
  if (existingRoles && existingRoles.length > 0) {
    existingRoles.forEach(existing => {
      const rowIndex = normalizedData.findIndex(row => row.name === existing.name);
      if (rowIndex !== -1) {
        errors.push({
          row: rowIndex + 2,
          field: 'name',
          message: `Role ${existing.name} already exists`
        });
      }
    });
  }
  
  // Process each row
  for (let i = 0; i < normalizedData.length; i++) {
    const row = normalizedData[i];
    const rowNumber = i + 2;
    
    // Skip rows with validation errors
    if (errors.some(error => error.row === rowNumber)) {
      continue;
    }
    
    try {
      const { error } = await supabase
        .from('roles')
        .insert([{ name: row.name,tenant_id: tenantId }]);
      
      if (error) {
        errors.push({
          row: rowNumber,
          message: error.message,
          data: row
        });
      } else {
        successfulRecords++;
      }
    } catch (err) {
      errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        data: row
      });
    }
  }
  
  return {
    success: errors.length === 0,
    totalRecords: data.length,
    successfulRecords,
    failedRecords: data.length - successfulRecords,
    errors,
    warnings
  };
}

// Import leave types
export async function importLeaveTypes(data: any[]): Promise<ImportResult> {
  const errors: ImportError[] = [];
  let successfulRecords = 0;
  const warnings: string[] = [];
  
  const normalizedData = data.map(row => {
    const newRow = {};

    Object.keys(row).forEach(key => {
      newRow[normalizeKey(key)] = row[key];
    });

    return newRow;
  });

  // Validate data first
  const validationErrors = validateImportData(normalizedData, 'leave_types');
  if (validationErrors.length > 0) {
    return {
      success: false,
      totalRecords: data.length,
      successfulRecords: 0,
      failedRecords: data.length,
      errors: validationErrors,
      warnings
    };
  }
  
  const tenantId = await getTenantId();

  // Check for existing leave type names
  const names = normalizedData.map(row => row.name);
  const { data: existingTypes } = await supabase
    .from('leave_types')
    .select('name')
    .eq('tenant_id', tenantId)
    .in('name', names);
  
  if (existingTypes && existingTypes.length > 0) {
    existingTypes.forEach(existing => {
      const rowIndex = normalizedData.findIndex(row => row.name === existing.name);
      if (rowIndex !== -1) {
        errors.push({
          row: rowIndex + 2,
          field: 'name',
          message: `Leave type ${existing.name} already exists`
        });
      }
    });
  }
  
  // Process each row
  for (let i = 0; i < normalizedData.length; i++) {
    const row = normalizedData[i];
    const rowNumber = i + 2;
    
    // Skip rows with validation errors
    if (errors.some(error => error.row === rowNumber)) {
      continue;
    }
    
    try {
      const leaveTypeData = {
        name: row.name,
        description: row.description || null,
        default_days: parseInt(row.default_days) || 0,
        requires_approval: convertBoolean(row.requires_approval ?? true),
        is_active: convertBoolean(row.is_active ?? true),
        is_paid: convertBoolean(row.is_paid ?? true),
        tenant_id:tenantId
      };
      
      const { error } = await supabase
        .from('leave_types')
        .insert([leaveTypeData]);
      
      if (error) {
        errors.push({
          row: rowNumber,
          message: error.message,
          data: row
        });
      } else {
        successfulRecords++;
      }
    } catch (err) {
      errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        data: row
      });
    }
  }
  
  return {
    success: errors.length === 0,
    totalRecords: data.length,
    successfulRecords,
    failedRecords: data.length - successfulRecords,
    errors,
    warnings
  };
}

// Import holidays
export async function importHolidays(data: any[], userId: string): Promise<ImportResult> {
  const errors: ImportError[] = [];
  let successfulRecords = 0;
  const warnings: string[] = [];
  
  const normalizedData = data.map(row => {
    const newRow = {};

    Object.keys(row).forEach(key => {
      newRow[normalizeKey(key)] = row[key];
    });

    return newRow;
  });

  // Validate data first
  const validationErrors = validateImportData(normalizedData, 'holidays');
  if (validationErrors.length > 0) {
    return {
      success: false,
      totalRecords: data.length,
      successfulRecords: 0,
      failedRecords: data.length,
      errors: validationErrors,
      warnings
    };
  }
  
  const tenantId = await getTenantId();

  // Process each row
  for (let i = 0; i < normalizedData.length; i++) {
    const row = normalizedData[i];
    const rowNumber = i + 2;
    
    try {
      const holidayData = {
        name: row.name,
        date: row.date,
        holiday_type: row.holiday_type,
        description: row.description || null,
        is_recurring: convertBoolean(row.is_recurring ?? false),
        notification_sent: false,
        is_active: true,
        created_by: userId,
        tenant_id : tenantId
      };
      
      const { error } = await supabase
        .from('holidays')
        .insert([holidayData]);
      
      if (error) {
        errors.push({
          row: rowNumber,
          message: error.message,
          data: row
        });
      } else {
        successfulRecords++;
      }
    } catch (err) {
      errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        data: row
      });
    }
  }
  
  return {
    success: errors.length === 0,
    totalRecords: data.length,
    successfulRecords,
    failedRecords: data.length - successfulRecords,
    errors,
    warnings
  };
}

// Import shifts
export async function importShifts(data: any[]): Promise<ImportResult> {
  const errors: ImportError[] = [];
  let successfulRecords = 0;
  const warnings: string[] = [];
  
  const normalizedData = data.map(row => {
    const newRow = {};

    Object.keys(row).forEach(key => {
      newRow[normalizeKey(key)] = row[key];
    });

    return newRow;
  });

  // Validate data first
  const validationErrors = validateImportData(normalizedData, 'shifts');
  if (validationErrors.length > 0) {
    return {
      success: false,
      totalRecords: data.length,
      successfulRecords: 0,
      failedRecords: data.length,
      errors: validationErrors,
      warnings
    };
  }
  
  const tenantId = await getTenantId();

  // Check for existing component names
  const names = normalizedData.map(row => row.name);
  const { data: existingShifts } = await supabase
    .from('shifts')
    .select('name')
    .eq('tenant_id', tenantId)
    .in('name', names);

  if (existingShifts && existingShifts.length > 0) {
    existingShifts.forEach(existing => {
      const rowIndex = normalizedData.findIndex(row => row.name === existing.name);
      if (rowIndex !== -1) {
        errors.push({
          row: rowIndex + 2,
          field: 'name',
          message: `Shift ${existing.name} already exists`
        });
      }
    });
  }

  // Process each row
  for (let i = 0; i < normalizedData.length; i++) {
    const row = normalizedData[i];
    const rowNumber = i + 2;
    
    // Skip rows with validation errors
    if (errors.some(error => error.row === rowNumber)) {
      continue;
    }

    try {
      const shiftData = {
        name: row.name,
        description: row.description || null,
        start_time: `${row.start_time}:00`,
        end_time: `${row.end_time}:00`,
        break_start_time: `${row.break_start_time}:00`,
        break_end_time: `${row.break_end_time}:00`,
        shift_type: row.shift_type,
        is_active: convertBoolean(row.is_active ?? true),
        tenant_id:tenantId
      };
      
      const { error } = await supabase
        .from('shifts')
        .insert([shiftData]);
      
      if (error) {
        errors.push({
          row: rowNumber,
          message: error.message,
          data: row
        });
      } else {
        successfulRecords++;
      }
    } catch (err) {
      errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        data: row
      });
    }
  }
  
  return {
    success: errors.length === 0,
    totalRecords: data.length,
    successfulRecords,
    failedRecords: data.length - successfulRecords,
    errors,
    warnings
  };
}

// Import payroll components
export async function importPayrollComponents(data: any[]): Promise<ImportResult> {
  const errors: ImportError[] = [];
  let successfulRecords = 0;
  const warnings: string[] = [];
  
  const normalizedData = data.map(row => {
    const newRow = {};

    Object.keys(row).forEach(key => {
      newRow[normalizeKey(key)] = row[key];
    });

    return newRow;
  });

  // Validate data first
  const validationErrors = validateImportData(normalizedData, 'payroll_components');
  if (validationErrors.length > 0) {
    return {
      success: false,
      totalRecords: data.length,
      successfulRecords: 0,
      failedRecords: data.length,
      errors: validationErrors,
      warnings
    };
  }
  
  const tenantId = await getTenantId();

  // Check for existing component names
  const names = normalizedData.map(row => row.name);
  const { data: existingComponents } = await supabase
    .from('payroll_components')
    .select('name')
    .eq('tenant_id', tenantId)
    .in('name', names);
  
  if (existingComponents && existingComponents.length > 0) {
    existingComponents.forEach(existing => {
      const rowIndex = normalizedData.findIndex(row => row.name === existing.name);
      if (rowIndex !== -1) {
        errors.push({
          row: rowIndex + 2,
          field: 'name',
          message: `Payroll component ${existing.name} already exists`
        });
      }
    });
  }
  
  // Process each row
  for (let i = 0; i < normalizedData.length; i++) {
    const row = normalizedData[i];
    const rowNumber = i + 2;
    
    // Skip rows with validation errors
    if (errors.some(error => error.row === rowNumber)) {
      continue;
    }
    
    try {
      const componentData = {
        name: row.name,
        description: row.description || null,
        component_type: row.component_type,
        is_active: convertBoolean(row.is_active ?? true),
        tenant_id:tenantId
      };
      
      const { error } = await supabase
        .from('payroll_components')
        .insert([componentData]);
      
      if (error) {
        errors.push({
          row: rowNumber,
          message: error.message,
          data: row
        });
      } else {
        successfulRecords++;
      }
    } catch (err) {
      errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        data: row
      });
    }
  }
  
  return {
    success: errors.length === 0,
    totalRecords: data.length,
    successfulRecords,
    failedRecords: data.length - successfulRecords,
    errors,
    warnings
  };
}

// Generate sample data for download
export function generateSampleData(entityType: string): any[] {
  switch (entityType) {
    case 'employees':
      return [
        {
          name: 'John Doe',
          email: 'john.doe@company.com',
          employee_code: 'EMP001',
          cadre: 'Staff',
          department: 'Engineering',
          role: 'Software Engineer',
          status: 'Active',
          start_date: '2024-01-15',
          address: '123 Main St, City, State 12345',
          date_of_birth: '1990-05-15',
          father_name: 'Robert Doe',
          uan_number: '123456789012',
          contact_number: '+1-555-0123'
        },
        {
          name: 'Jane Smith',
          email: 'jane.smith@company.com',
          employee_code: 'EMP002',
          cadre: 'Manager',
          department: 'Marketing',
          role: 'Marketing Manager',
          status: 'Active',
          start_date: '2024-02-01',
          address: '456 Oak Ave, City, State 12345',
          date_of_birth: '1988-08-22',
          father_name: 'William Smith',
          uan_number: '987654321098',
          contact_number: '+1-555-0456'
        }
      ];
    case 'departments':
      return [
        { name: 'Engineering' },
        { name: 'Marketing' },
        { name: 'Sales' },
        { name: 'Human Resources' }
      ];
    case 'roles':
      return [
        { name: 'Software Engineer' },
        { name: 'Senior Developer' },
        { name: 'Marketing Manager' },
        { name: 'Sales Representative' }
      ];
    case 'leave_types':
      return [
        {
          name: 'Annual Leave',
          description: 'Yearly vacation leave',
          default_days: 20,
          requires_approval: true,
          is_active: true,
          is_paid: true
        },
        {
          name: 'Sick Leave',
          description: 'Medical leave',
          default_days: 10,
          requires_approval: false,
          is_active: true,
          is_paid: true
        }
      ];
    case 'holidays':
      return [
        {
          name: 'New Year\'s Day',
          date: '2024-01-01',
          holiday_type: 'public',
          description: 'New Year celebration',
          is_recurring: false
        },
        {
          name: 'Independence Day',
          date: '2024-07-04',
          holiday_type: 'public',
          description: 'National holiday',
          is_recurring: false
        }
      ];
    case 'shifts':
      return [
        {
          name: 'Morning Shift',
          description: 'Standard morning working hours',
          start_time: '09:00',
          end_time: '17:00',
          break_start_time: '12:00',
          break_end_time: '13:00',
          shift_type: 'morning',
          is_active: true
        },
        {
          name: 'Night Shift',
          description: 'Night working hours',
          start_time: '22:00',
          end_time: '06:00',
          break_start_time: '01:00',
          break_end_time: '02:00',
          shift_type: 'night',
          is_active: true
        }
      ];
    case 'payroll_components':
      return [
        {
          name: 'Basic Salary',
          description: 'Base salary component',
          component_type: 'earning',
          is_active: true
        },
        {
          name: 'Income Tax',
          description: 'Tax deduction',
          component_type: 'deduction',
          is_active: true
        }
      ];
    default:
      return [];
  }
}

// Get field mappings for each entity
export function getFieldMappings(entityType: string): Record<string, string> {
  const rules = validationRules[entityType] || [];
  const mappings: Record<string, string> = {};
  
  rules.forEach(rule => {
    mappings[rule.field] = rule.field
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  });
  
  return mappings;
}