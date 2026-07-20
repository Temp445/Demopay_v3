import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { type Employee } from '../../../stores/employeesStore';

interface SortableEmployeeProps {
  employee: Employee;
  disabled?: boolean;
}

export default function SortableEmployee({ employee, disabled }: SortableEmployeeProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: employee.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center p-3 bg-white border rounded-md ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-grab hover:bg-gray-50'
      }`}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-5 w-5 text-gray-400 mr-3" />
      <div>
        <p className="text-sm font-medium text-gray-900">{employee.name}</p>
        <p className="text-sm text-gray-500">{employee.department}</p>
      </div>
    </div>
  );
}