import { useState } from 'react';
import { Glyph } from '../ui/PaperIcon.tsx';
import { useAccount } from './AccountProvider.tsx';
import { AccountDialog } from './AccountDialog.tsx';

export function AccountEntry({ className }: { className?: string }) {
  const [open, setOpen] = useState(false),
    { account } = useAccount();
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={account ? '老师账号' : '登录'}
        onClick={() => setOpen(true)}
      >
        <Glyph name="person" />
        <span>{account ? '老师账号' : '登录'}</span>
      </button>
      {open && <AccountDialog onClose={() => setOpen(false)} />}
    </>
  );
}
