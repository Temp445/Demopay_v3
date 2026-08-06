import { useEffect } from 'react';

// Create a singleton DOM node outside of the React root
let loaderNode: HTMLDivElement | null = null;
let activeLoaders = 0;

export default function GlobalLoader() {
  useEffect(() => {
    if (!loaderNode) {
      loaderNode = document.createElement('div');
      loaderNode.className = "fixed inset-0 z-[9999] bg-gray-50 flex flex-col items-center justify-center";
      loaderNode.innerHTML = `
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p class="text-gray-500 text-sm font-medium animate-pulse">Loading Ace Payroll...</p>
      `;
      document.body.appendChild(loaderNode);
    }
    
    activeLoaders++;
    loaderNode.style.display = 'flex';
    
    return () => {
      activeLoaders--;
      // Wait a tiny bit to allow the next loader in the sequence to mount before hiding
      // This prevents a 1-frame flash between sequential loading states
      setTimeout(() => {
        if (activeLoaders <= 0 && loaderNode) {
          loaderNode.style.display = 'none';
        }
      }, 50);
    };
  }, []);
  
  return null;
}
