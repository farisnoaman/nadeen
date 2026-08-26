'use client';

export async function copyText(text: string) {
  // The Arena preview iframe blocks navigator.clipboard through Permissions Policy.
  // Use the selection-based copy path directly so the blocked API is never invoked.
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.inset = '0 auto auto -9999px';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.focus();
  field.select();
  field.setSelectionRange(0, field.value.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    field.remove();
  }
  if (!copied) throw new Error('Copy is unavailable in this browser.');
}
