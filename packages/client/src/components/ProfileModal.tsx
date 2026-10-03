import { AVATAR_IDS, type AvatarId } from '@kozel/shared';
import { useState } from 'react';
import { useKozelClient } from '../KozelClientProvider.js';

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const { playerName, setPlayerName, avatarId, setAvatarId } = useKozelClient();
  const [name, setName] = useState(playerName);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarId | null>(avatarId);

  function save() {
    const trimmed = name.trim();
    if (trimmed) setPlayerName(trimmed);
    setAvatarId(selectedAvatar);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Zavřít profil">
          ✕
        </button>
        <h2>Tvůj profil</h2>

        <label className="profile-modal__label" htmlFor="profile-name">
          Přezdívka
        </label>
        <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoFocus />

        <p className="profile-modal__label">Avatar</p>
        <div className="avatar-grid">
          {AVATAR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={[
                'avatar-grid__item',
                selectedAvatar === id ? 'avatar-grid__item--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelectedAvatar(id)}
              aria-label={`Avatar ${id}`}
              aria-pressed={selectedAvatar === id}
            >
              <img src={`/avatars/${id}.png`} alt="" />
            </button>
          ))}
        </div>

        <div className="row profile-modal__actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Zrušit
          </button>
          <button type="button" onClick={save} disabled={name.trim().length === 0}>
            Uložit
          </button>
        </div>
      </div>
    </div>
  );
}
