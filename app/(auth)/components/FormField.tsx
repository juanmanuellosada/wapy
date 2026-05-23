'use client';

import { forwardRef, InputHTMLAttributes, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ id, label, error, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword && showPassword ? 'text' : type;

    return (
      <div className="flex flex-col gap-1">
        <label
          htmlFor={id}
          className="text-sm font-semibold text-[#16222E]"
        >
          {label}
          {props.required && (
            <span className="text-red-600 ml-1" aria-hidden>
              *
            </span>
          )}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={inputType}
            aria-describedby={error ? `${id}-error` : undefined}
            aria-invalid={!!error}
            className={[
              'w-full min-h-[44px] rounded-xl border px-4 py-3 text-[#16222E] text-sm',
              'bg-white placeholder:text-[#16222E]/40',
              'focus:outline-none focus:ring-2 focus:ring-[#F5C84B] focus:border-transparent',
              'transition-colors duration-150',
              isPassword ? 'pr-11' : '',
              error
                ? 'border-red-500 bg-red-50'
                : 'border-[#16222E]/20 hover:border-[#16222E]/40',
            ]
              .filter(Boolean)
              .join(' ')}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#16222E]/50 hover:text-[#16222E] transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>
        {error && (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-xs text-red-600 mt-0.5"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';
