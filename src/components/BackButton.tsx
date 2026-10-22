import { ArrowLeft } from 'lucide-react';

export function BackButton() {
  return (
    <button
      onClick={() => window.history.back()}
      className='mtv-mheader-back'
      aria-label='Back'
    >
      <ArrowLeft className='w-full h-full' />
    </button>
  );
}
