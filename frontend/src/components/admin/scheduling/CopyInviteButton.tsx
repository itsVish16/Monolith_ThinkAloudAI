import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyInviteButtonProps {
  url: string;
  className?: string;
  buttonText?: string;
  showIconOnly?: boolean;
}

export const CopyInviteButton: React.FC<CopyInviteButtonProps> = ({
  url,
  className = '',
  buttonText = 'Copy Invite Link',
  showIconOnly = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.error('Failed to copy invite URL:', err);
    }
  };

  if (showIconOnly) {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'Copied to clipboard!' : 'Copy candidate invite link'}
        className={`sch-act-btn sch-act-copy ${copied ? 'sch-act-copied' : ''} ${className}`}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied && <span className="sch-copied-pop">Copied!</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`sch-btn sch-btn-soft sch-btn-sm ${copied ? 'sch-btn-copied' : ''} ${className}`}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? 'Link Copied!' : buttonText}</span>
    </button>
  );
};
