import React from 'react';

interface AlertDialogProps {
    isOpen: boolean;
    title: string;
    description: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    type?: 'danger' | 'warning' | 'info';
}

const AlertDialog: React.FC<AlertDialogProps> = ({
    isOpen,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
    type = 'danger'
}) => {
    if (!isOpen) return null;

    const colors = {
        danger: {
            iconBg: 'bg-red-100 dark:bg-red-900/30',
            iconColor: 'text-red-600 dark:text-red-400',
            buttonBg: 'bg-red-600 hover:bg-red-700',
            buttonRing: 'focus:ring-red-500',
            icon: 'delete_forever'
        },
        warning: {
            iconBg: 'bg-amber-100 dark:bg-amber-900/30',
            iconColor: 'text-amber-600 dark:text-amber-400',
            buttonBg: 'bg-amber-600 hover:bg-amber-700',
            buttonRing: 'focus:ring-amber-500',
            icon: 'warning'
        },
        info: {
            iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
            iconColor: 'text-emerald-600 dark:text-emerald-400',
            buttonBg: 'bg-emerald-600 hover:bg-emerald-700',
            buttonRing: 'focus:ring-emerald-500',
            icon: 'info'
        }
    };

    const style = colors[type];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            {/* Backdrop with Blur */}
            <div
                className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onCancel}
            />

            {/* Dialog Panel */}
            <div className="relative bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-white/20 dark:border-white/10 transform transition-all animate-in zoom-in-95 duration-200">

                {/* Decorative Top Border/Glow */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${type === 'danger' ? 'bg-red-500' : 'bg-primary'}`} />

                <div className="p-6">
                    <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className={`flex-shrink-0 w-12 h-12 rounded-full ${style.iconBg} flex items-center justify-center`}>
                            <span className={`material-icons-outlined text-2xl ${style.iconColor}`}>
                                {style.icon}
                            </span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 pt-1">
                            <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white mb-2">
                                {title}
                            </h3>
                            <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                {description}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer / Actions */}
                <div className="bg-slate-50 dark:bg-black/20 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-white/5">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-lg text-sm font-bold text-white shadow-lg ${style.buttonBg} transition-all transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-black ${style.buttonRing}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertDialog;
