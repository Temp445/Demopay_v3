import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';

interface Option {
    label: string;
    value: string;
    sub?: string; // optional sub-label (e.g. employee code)
}

interface MultiSelectDropdownProps {
    options: Option[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
    allLabel?: string;   // label for the "All" line, e.g. "All Cadres"
    searchable?: boolean;
    maxTagsShown?: number;  // how many tags to show before "+N more"
}

export default function MultiSelectDropdown({
    options,
    selected,
    onChange,
    placeholder = 'Select...',
    allLabel = 'All',
    searchable = true,
    maxTagsShown = 2,
}: MultiSelectDropdownProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filteredOptions = searchable && search
        ? options.filter(o =>
            o.label.toLowerCase().includes(search.toLowerCase()) ||
            o.sub?.toLowerCase().includes(search.toLowerCase())
        )
        : options;

    const allSelected = selected.length === 0; // empty = all

    const toggleValue = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter(v => v !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const clearAll = () => onChange([]);

    const shownTags = selected.slice(0, maxTagsShown);
    const extraCount = selected.length - maxTagsShown;

    const triggerLabel = allSelected ? allLabel : null;

    return (
        <div className="relative" ref={containerRef}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center justify-between gap-2 rounded-md border shadow-sm px-3 py-1.5 text-sm bg-white transition-colors
          ${open ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-300 hover:border-gray-400'}`}
            >
                <span className="flex flex-wrap gap-1 flex-1 min-w-0 items-center">
                    {triggerLabel ? (
                        <span className="text-gray-400">{triggerLabel}</span>
                    ) : (
                        <>
                            {shownTags.map(v => {
                                const opt = options.find(o => o.value === v);
                                return (
                                    <span
                                        key={v}
                                        className="inline-flex items-center gap-0.5 bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 text-xs font-medium"
                                    >
                                        {opt?.label ?? v}
                                        <X
                                            className="h-3 w-3 cursor-pointer hover:text-indigo-900"
                                            onClick={(e) => { e.stopPropagation(); toggleValue(v); }}
                                        />
                                    </span>
                                );
                            })}
                            {extraCount > 0 && (
                                <span className="text-xs text-indigo-500 font-medium">+{extraCount} more</span>
                            )}
                        </>
                    )}
                </span>
                <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Panel */}
            {open && (
                <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {searchable && (
                        <div className="p-2 border-b border-gray-100">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                                <input
                                    autoFocus
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={`Search...`}
                                    className="w-full pl-8 pr-2 py-1.5 text-xs rounded border border-gray-200 focus:outline-none focus:border-indigo-400"
                                />
                            </div>
                        </div>
                    )}

                    <div className="max-h-52 overflow-y-auto">
                        {/* "All" clear row */}
                        {!search && (
                            <button
                                type="button"
                                onClick={clearAll}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors
                  ${allSelected ? 'text-indigo-600 font-semibold' : 'text-gray-500'}`}
                            >
                                <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0
                  ${allSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                                    {allSelected && <Check className="h-3 w-3 text-white" />}
                                </span>
                                {allLabel}
                            </button>
                        )}

                        {filteredOptions.length === 0 && (
                            <p className="px-3 py-4 text-xs text-gray-400 text-center">No results</p>
                        )}

                        {filteredOptions.map(option => {
                            const isSelected = selected.includes(option.value);
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => toggleValue(option.value)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-indigo-50 transition-colors text-left
                    ${isSelected ? 'bg-indigo-50/50 text-indigo-700' : 'text-gray-700'}`}
                                >
                                    <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0
                    ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                    </span>
                                    <span className="flex-1 truncate">
                                        {option.label}
                                        {option.sub && <span className="text-xs text-gray-400 ml-1">({option.sub})</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {selected.length > 0 && (
                        <div className="p-2 border-t border-gray-100 flex justify-between items-center">
                            <span className="text-xs text-gray-500">{selected.length} selected</span>
                            <button
                                type="button"
                                onClick={clearAll}
                                className="text-xs text-red-500 hover:text-red-700 font-medium"
                            >
                                Clear all
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
