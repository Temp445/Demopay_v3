/**
 * PART 2: UI Checkbox Implementation
 *
 * Location: AddPayStructureModal.tsx, in the deductions mapping section
 * Around line 1046-1060 where statutory deduction components are rendered
 *
 * REPLACE the existing statutory deduction header section with this enhanced version
 */

// ======== BEFORE (Existing Code) ========
{component.isStatutory && (
  <div className="flex items-center mb-2 text-indigo-700 text-sm font-medium">
    <Lock className="h-4 w-4 mr-1" />
    Statutory Deduction (Locked)
  </div>
)}

// ======== AFTER (New Code with Checkbox) ========
{component.isStatutory && (
  <div className="mb-3">
    {/* Existing lock indicator */}
    <div className="flex items-center mb-2 text-indigo-700 text-sm font-medium">
      <Lock className="h-4 w-4 mr-1" />
      Statutory Deduction (Locked)
    </div>

    {/* ✅ NEW: Checkbox to control application in calculation */}
    <label className="flex items-center cursor-pointer mt-2">
      <input
        type="checkbox"
        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
        checked={component.is_applied_in_calculation !== false}
        onChange={(e) =>
          updateComponent('deduction', index, {
            is_applied_in_calculation: e.target.checked,
          })
        }
      />
      <span className="ml-2 text-sm text-gray-700">
        Apply in payroll calculation
      </span>
    </label>

    {/* ✅ NEW: Warning message when unchecked */}
    {component.is_applied_in_calculation === false && (
      <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-start">
        <span className="font-semibold mr-1">ⓘ</span>
        <span>
          This component will appear in payroll reports but will NOT be applied in salary calculations
        </span>
      </div>
    )}
  </div>
)}

/**
 * COMPLETE SECTION CONTEXT:
 * This goes inside the deductions.map() section, right after the opening div tag
 * and before the component form fields
 */

// Full context showing placement:
{formData.deductions.map((component, index) => (
  <div
    key={component.key}
    className={`mb-4 p-4 border rounded-lg ${
      component.isStatutory
        ? 'bg-indigo-50 border-indigo-200'
        : 'bg-gray-50'
    }`}
  >
    {/* ⬇️ ADD THE NEW CODE HERE ⬇️ */}
    {component.isStatutory && (
      <div className="mb-3">
        <div className="flex items-center mb-2 text-indigo-700 text-sm font-medium">
          <Lock className="h-4 w-4 mr-1" />
          Statutory Deduction (Locked)
        </div>

        <label className="flex items-center cursor-pointer mt-2">
          <input
            type="checkbox"
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            checked={component.is_applied_in_calculation !== false}
            onChange={(e) =>
              updateComponent('deduction', index, {
                is_applied_in_calculation: e.target.checked,
              })
            }
          />
          <span className="ml-2 text-sm text-gray-700">
            Apply in payroll calculation
          </span>
        </label>

        {component.is_applied_in_calculation === false && (
          <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-start">
            <span className="font-semibold mr-1">ⓘ</span>
            <span>
              This component will appear in payroll reports but will NOT be applied in salary calculations
            </span>
          </div>
        )}
      </div>
    )}
    {/* ⬆️ END OF NEW CODE ⬆️ */}

    <div className="grid grid-cols-1 gap-4">
      {/* Component Name Selection */}
      {/* ... rest of component rendering ... */}
    </div>
  </div>
))}
