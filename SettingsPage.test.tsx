/**
 * Test Suite for SettingsPage Component
 * Tests SMTP Configuration functionality including validation, saving, and testing
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import SettingsPage from './SettingsPage';
import { supabase } from '../../../lib/supabase';
import { validateAuth } from '../../../stores/utils/storeUtils';

// Mock dependencies
jest.mock('../../../lib/supabase');
jest.mock('../../../stores/utils/storeUtils');

const mockValidateAuth = validateAuth as jest.MockedFunction<typeof validateAuth>;
const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('SettingsPage', () => {
  const mockTenantId = 'test-tenant-id';
  const mockUserId = 'test-user-id';

  const mockSMTPConfig = {
    id: 'config-id-1',
    host: 'smtp.example.com',
    port: 587,
    username: 'user@example.com',
    password: 'password123',
    encryption: 'tls' as const,
    sender_email: 'noreply@example.com',
    sender_name: 'Test Company',
    is_active: true,
    tenant_id: mockTenantId,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  };

  beforeEach(() => {
    // Setup default mocks
    mockValidateAuth.mockResolvedValue({
      isAuthenticated: true,
      userId: mockUserId,
      tenantId: mockTenantId
    });

    // Mock Supabase select query
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: null,
            error: null
          })
        })
      })
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Rendering Tests
  // ============================================================================

  describe('Rendering', () => {
    test('displays loading state initially', () => {
      render(<SettingsPage />);
      expect(screen.getByText(/loading configuration/i)).toBeInTheDocument();
    });

    test('renders all form fields after loading', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/smtp host/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^port/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/sender email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/sender name/i)).toBeInTheDocument();
      });
    });

    test('displays encryption type options', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('NONE')).toBeInTheDocument();
        expect(screen.getByText('TLS')).toBeInTheDocument();
        expect(screen.getByText('SSL')).toBeInTheDocument();
      });
    });

    test('displays action buttons', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save configuration/i })).toBeInTheDocument();
      });
    });

    test('loads existing configuration from database', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockSMTPConfig,
              error: null
            })
          })
        })
      } as any);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('smtp.example.com')).toBeInTheDocument();
        expect(screen.getByDisplayValue('587')).toBeInTheDocument();
        expect(screen.getByDisplayValue('user@example.com')).toBeInTheDocument();
        expect(screen.getByDisplayValue('noreply@example.com')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Test Company')).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Validation Tests
  // ============================================================================

  describe('Form Validation', () => {
    test('validates required host field', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        const hostInput = screen.getByLabelText(/smtp host/i);
        fireEvent.change(hostInput, { target: { value: '' } });
        fireEvent.blur(hostInput);
      });

      const saveButton = screen.getByRole('button', { name: /save configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/smtp host is required/i)).toBeInTheDocument();
      });
    });

    test('validates minimum host length', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        const hostInput = screen.getByLabelText(/smtp host/i);
        fireEvent.change(hostInput, { target: { value: 'ab' } });
      });

      const saveButton = screen.getByRole('button', { name: /save configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/must be at least 3 characters/i)).toBeInTheDocument();
      });
    });

    test('validates port range', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        const portInput = screen.getByLabelText(/^port/i);

        // Test port 0
        fireEvent.change(portInput, { target: { value: '0' } });
      });

      const saveButton = screen.getByRole('button', { name: /save configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/port must be between 1 and 65535/i)).toBeInTheDocument();
      });
    });

    test('validates email format for sender email', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        const emailInput = screen.getByLabelText(/sender email/i);
        fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      });

      const saveButton = screen.getByRole('button', { name: /save configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
      });
    });

    test('validates password minimum length', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        const passwordInput = screen.getByLabelText(/password/i);
        fireEvent.change(passwordInput, { target: { value: '12345' } });
      });

      const saveButton = screen.getByRole('button', { name: /save configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/password must be at least 6 characters/i)).toBeInTheDocument();
      });
    });

    test('accepts valid form data', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockSMTPConfig,
              error: null
            })
          })
        })
      } as any);

      render(<SettingsPage />);

      await waitFor(() => {
        fireEvent.change(screen.getByLabelText(/smtp host/i), {
          target: { value: 'smtp.example.com' }
        });
        fireEvent.change(screen.getByLabelText(/^port/i), {
          target: { value: '587' }
        });
        fireEvent.change(screen.getByLabelText(/username/i), {
          target: { value: 'user@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/password/i), {
          target: { value: 'password123' }
        });
        fireEvent.change(screen.getByLabelText(/sender email/i), {
          target: { value: 'noreply@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/sender name/i), {
          target: { value: 'Test Company' }
        });
      });

      const saveButton = screen.getByRole('button', { name: /save configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.queryByText(/validation/i)).not.toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Interaction Tests
  // ============================================================================

  describe('User Interactions', () => {
    test('toggles password visibility', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
        expect(passwordInput.type).toBe('password');

        const toggleButton = screen.getByRole('button', { name: '' }); // Eye icon button
        fireEvent.click(toggleButton);

        expect(passwordInput.type).toBe('text');
      });
    });

    test('changes encryption type selection', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        const sslOption = screen.getByLabelText(/ssl/i);
        fireEvent.click(sslOption);
        expect(sslOption).toBeChecked();
      });
    });

    test('enables/disables SMTP configuration', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        const toggleSwitch = screen.getByRole('checkbox', { hidden: true });
        expect(toggleSwitch).toBeChecked();

        fireEvent.click(toggleSwitch);
        expect(toggleSwitch).not.toBeChecked();
      });
    });

    test('clears field errors on input change', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        const hostInput = screen.getByLabelText(/smtp host/i);
        fireEvent.change(hostInput, { target: { value: '' } });
      });

      const saveButton = screen.getByRole('button', { name: /save configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/smtp host is required/i)).toBeInTheDocument();
      });

      // Type in the field
      await waitFor(() => {
        const hostInput = screen.getByLabelText(/smtp host/i);
        fireEvent.change(hostInput, { target: { value: 'smtp.example.com' } });
      });

      await waitFor(() => {
        expect(screen.queryByText(/smtp host is required/i)).not.toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Save Operation Tests
  // ============================================================================

  describe('Save Operation', () => {
    test('creates new configuration when none exists', async () => {
      const insertMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockSMTPConfig,
            error: null
          })
        })
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null
            })
          })
        }),
        insert: insertMock
      } as any);

      render(<SettingsPage />);

      // Fill in valid form data
      await waitFor(async () => {
        fireEvent.change(screen.getByLabelText(/smtp host/i), {
          target: { value: 'smtp.example.com' }
        });
        fireEvent.change(screen.getByLabelText(/^port/i), {
          target: { value: '587' }
        });
        fireEvent.change(screen.getByLabelText(/username/i), {
          target: { value: 'user@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/password/i), {
          target: { value: 'password123' }
        });
        fireEvent.change(screen.getByLabelText(/sender email/i), {
          target: { value: 'noreply@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/sender name/i), {
          target: { value: 'Test Company' }
        });

        const saveButton = screen.getByRole('button', { name: /save configuration/i });
        fireEvent.click(saveButton);
      });

      await waitFor(() => {
        expect(insertMock).toHaveBeenCalled();
        expect(screen.getByText(/smtp configuration saved successfully/i)).toBeInTheDocument();
      });
    });

    test('updates existing configuration', async () => {
      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { ...mockSMTPConfig, host: 'smtp.newhost.com' },
              error: null
            })
          })
        })
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockSMTPConfig,
              error: null
            })
          })
        }),
        update: updateMock
      } as any);

      render(<SettingsPage />);

      await waitFor(() => {
        const hostInput = screen.getByDisplayValue('smtp.example.com');
        fireEvent.change(hostInput, { target: { value: 'smtp.newhost.com' } });

        const saveButton = screen.getByRole('button', { name: /save configuration/i });
        fireEvent.click(saveButton);
      });

      await waitFor(() => {
        expect(updateMock).toHaveBeenCalled();
      });
    });

    test('displays error message on save failure', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null
            })
          })
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' }
            })
          })
        })
      } as any);

      render(<SettingsPage />);

      await waitFor(async () => {
        // Fill valid data
        fireEvent.change(screen.getByLabelText(/smtp host/i), {
          target: { value: 'smtp.example.com' }
        });
        fireEvent.change(screen.getByLabelText(/^port/i), {
          target: { value: '587' }
        });
        fireEvent.change(screen.getByLabelText(/username/i), {
          target: { value: 'user@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/password/i), {
          target: { value: 'password123' }
        });
        fireEvent.change(screen.getByLabelText(/sender email/i), {
          target: { value: 'noreply@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/sender name/i), {
          target: { value: 'Test Company' }
        });

        const saveButton = screen.getByRole('button', { name: /save configuration/i });
        fireEvent.click(saveButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/database error/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Cancel Operation Tests
  // ============================================================================

  describe('Cancel Operation', () => {
    test('reverts changes to original configuration', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockSMTPConfig,
              error: null
            })
          })
        })
      } as any);

      render(<SettingsPage />);

      await waitFor(() => {
        const hostInput = screen.getByDisplayValue('smtp.example.com');
        fireEvent.change(hostInput, { target: { value: 'smtp.changed.com' } });
        expect(screen.getByDisplayValue('smtp.changed.com')).toBeInTheDocument();

        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        fireEvent.click(cancelButton);
      });

      await waitFor(() => {
        expect(screen.getByDisplayValue('smtp.example.com')).toBeInTheDocument();
      });
    });

    test('clears validation errors on cancel', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        const hostInput = screen.getByLabelText(/smtp host/i);
        fireEvent.change(hostInput, { target: { value: '' } });
      });

      const saveButton = screen.getByRole('button', { name: /save configuration/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/smtp host is required/i)).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText(/smtp host is required/i)).not.toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Test Connection Tests
  // ============================================================================

  describe('Test Connection', () => {
    test('validates form before testing', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        const testButton = screen.getByRole('button', { name: /test connection/i });
        fireEvent.click(testButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/validation failed/i)).toBeInTheDocument();
      });
    });

    test('displays success message for valid configuration', async () => {
      render(<SettingsPage />);

      // Fill in valid configuration
      await waitFor(() => {
        fireEvent.change(screen.getByLabelText(/smtp host/i), {
          target: { value: 'smtp.example.com' }
        });
        fireEvent.change(screen.getByLabelText(/^port/i), {
          target: { value: '587' }
        });
        fireEvent.change(screen.getByLabelText(/username/i), {
          target: { value: 'user@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/password/i), {
          target: { value: 'password123' }
        });
        fireEvent.change(screen.getByLabelText(/sender email/i), {
          target: { value: 'noreply@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/sender name/i), {
          target: { value: 'Test Company' }
        });
      });

      const testButton = screen.getByRole('button', { name: /test connection/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText(/connection successful/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('shows loading state during test', async () => {
      render(<SettingsPage />);

      // Fill in valid configuration
      await waitFor(() => {
        fireEvent.change(screen.getByLabelText(/smtp host/i), {
          target: { value: 'smtp.example.com' }
        });
        fireEvent.change(screen.getByLabelText(/^port/i), {
          target: { value: '587' }
        });
        fireEvent.change(screen.getByLabelText(/username/i), {
          target: { value: 'user@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/password/i), {
          target: { value: 'password123' }
        });
        fireEvent.change(screen.getByLabelText(/sender email/i), {
          target: { value: 'noreply@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/sender name/i), {
          target: { value: 'Test Company' }
        });
      });

      const testButton = screen.getByRole('button', { name: /test connection/i });
      fireEvent.click(testButton);

      expect(screen.getByText(/testing/i)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Message Auto-Dismiss Tests
  // ============================================================================

  describe('Message Auto-Dismiss', () => {
    test('auto-dismisses success message after 5 seconds', async () => {
      jest.useFakeTimers();

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null
            })
          })
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockSMTPConfig,
              error: null
            })
          })
        })
      } as any);

      render(<SettingsPage />);

      // Fill and save
      await waitFor(() => {
        fireEvent.change(screen.getByLabelText(/smtp host/i), {
          target: { value: 'smtp.example.com' }
        });
        fireEvent.change(screen.getByLabelText(/^port/i), {
          target: { value: '587' }
        });
        fireEvent.change(screen.getByLabelText(/username/i), {
          target: { value: 'user@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/password/i), {
          target: { value: 'password123' }
        });
        fireEvent.change(screen.getByLabelText(/sender email/i), {
          target: { value: 'noreply@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/sender name/i), {
          target: { value: 'Test Company' }
        });

        const saveButton = screen.getByRole('button', { name: /save configuration/i });
        fireEvent.click(saveButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/smtp configuration saved successfully/i)).toBeInTheDocument();
      });

      // Fast-forward 5 seconds
      jest.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(screen.queryByText(/smtp configuration saved successfully/i)).not.toBeInTheDocument();
      });

      jest.useRealTimers();
    });
  });
});
