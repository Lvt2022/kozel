import type { AvatarId } from '@kozel/shared';

export function Avatar({
  avatarId,
  size = 'normal',
  className,
}: {
  avatarId: AvatarId | null;
  size?: 'small' | 'normal';
  className?: string;
}) {
  if (!avatarId) return null;
  return (
    <img
      src={`/avatars/${avatarId}.png`}
      alt=""
      className={['avatar-img', size === 'small' ? 'avatar-img--small' : '', className ?? ''].filter(Boolean).join(' ')}
    />
  );
}
