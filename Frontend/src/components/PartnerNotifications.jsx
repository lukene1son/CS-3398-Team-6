import React from 'react';
import { Users, MessageSquare, Hash, Bell, Check, X, ChevronRight, ShieldAlert } from 'lucide-react';
import Avatar from './Avatar';

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '14px 16px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: '0.9rem',
  color: '#1e293b',
};

// `lead` goes on the left (icon or pictures); `actions` (optional) goes on the right.
// With `onOpen`, the whole row is a button (the chat rows: click to go to that chat).
function Row({ lead, actions, onOpen, label, children }) {
  if (onOpen) {
    return (
      <button type="button" className="notif-row-link" onClick={onOpen} aria-label={label}
        style={{ ...rowStyle, width: '100%', border: 'none', borderBottom: rowStyle.borderBottom,
          background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
        {lead}
        <p style={{ margin: 0, flex: 1, minWidth: 0 }}>{children}</p>
        <ChevronRight size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
      </button>
    );
  }
  return (
    <div style={rowStyle}>
      {lead}
      <p style={{ margin: 0, flex: 1, minWidth: 0 }}>{children}</p>
      {actions}
    </div>
  );
}

// Just the icon: no background or border, and the button is only as big as the icon.
const actionButton = (color) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 2,
  border: 'none',
  background: 'none',
  color,
  cursor: 'pointer',
});


// Small accept (green check) and decline (red x) buttons for a request or invite.
function RespondButtons({ label, busy, onAccept, onDecline }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
      <button
        type="button"
        className="notif-action"
        onClick={onAccept}
        disabled={busy}
        title="Accept"
        aria-label={`Accept ${label}`}
        style={actionButton('#16a34a')}
      >
        <Check size={20} strokeWidth={3} />
      </button>
      <button
        type="button"
        className="notif-action"
        onClick={onDecline}
        disabled={busy}
        title="Decline"
        aria-label={`Decline ${label}`}
        style={actionButton('#dc2626')}
      >
        <X size={20} strokeWidth={3} />
      </button>
    </div>
  );
}
const STACK_MAX = 3;
const ring = (index) => ({
  display: 'inline-flex',
  marginLeft: index === 0 ? 0 : '-8px',
  borderRadius: '50%',
  boxShadow: '0 0 0 2px #fff',
});

// The first three members' pictures, overlapping, then "…" if there are more.
function AvatarStack({ members }) {
  const shown = members.slice(0, STACK_MAX);
  const extra = members.length - shown.length;

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      {shown.map((member, index) => (
        <span key={member.id} title={member.name} style={ring(index)}>
          <Avatar
            name={member.name}
            userId={member.id}
            color={member.avatar_color}
            hasAvatar={member.has_avatar}
            size={28}
          />
        </span>
      ))}

      {extra > 0 && (
        <span
          title={`${extra} more`}
          style={{
            ...ring(1),
            width: 28,
            height: 28,
            alignItems: 'center',
            justifyContent: 'center',
            background: '#e2e8f0',
            color: '#475569',
            fontSize: '0.85rem',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          …
        </span>
      )}
    </div>
  );
}

export default function PartnerNotifications({
  notifications = {},
  closing = false,
  onClosed,
  busyKey,
  onRespond,
  onClearAccepted,
  onOpenChat,
}) {
  const {
    friendRequests = [],
    groupInvites = [],
    accepted = [],
    unreadGroups = [],
    unreadGroupMessages = 0,
    unreadDirect = [],
    unreadDirectMessages = 0,
    unreadChannels = [],
    unreadChannelMessages = 0,
    loginAttempts = [],
  } = notifications;

  const isEmpty =
      loginAttempts.length +
      friendRequests.length +
      groupInvites.length +
      accepted.length +
      unreadGroupMessages +
      unreadDirectMessages +
      unreadChannelMessages ===
    0;

  return (
    <div
      className={closing ? 'notif-window closing' : 'notif-window'}
      onAnimationEnd={(event) => {
        if (event.animationName === 'notif-out' && onClosed) {
          onClosed();
        }
      }}
      style={{
        position: 'absolute',
        // Just under the header: the bell button is 32px tall, centered in the 70px
        // header, so the header's bottom edge is ~52px below the bell's top. +8px gap.
        top: '60px',
        // Centered on the bell. The same translateX is in the notif-in keyframes
        // (index.css), because an animated transform replaces this one while it plays.
        left: '50%',
        transform: 'translateX(-50%)',
        width: '340px',
        maxWidth: 'calc(100vw - 32px)',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.12)',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #e2e8f0',
          fontWeight: 700,
          color: '#1e293b',
        }}
      >
        Notifications
      </div>

      {isEmpty ? (
        <div
          style={{
            padding: '28px 16px',
            textAlign: 'center',
            color: '#64748b',
          }}
        >
          <Bell size={28} style={{ marginBottom: '10px' }} />
          <p style={{ margin: 0 }}>No new notifications.</p>
        </div>
      ) : (
        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
        {/* Sign-ins waiting for approval go first: they expire after 10 minutes. */}
          {loginAttempts.map((attempt) => (
            <Row
              key={`signin-${attempt.id}`}
              lead={<ShieldAlert size={22} color="#d97706" style={{ flexShrink: 0 }} />}
              actions={
                <RespondButtons
                  label={`sign-in attempt from ${attempt.device}`}
                  busy={busyKey === `loginAttempts-${attempt.id}`}
                  onAccept={() => onRespond('loginAttempts', attempt.id, 'accept')}
                  onDecline={() => onRespond('loginAttempts', attempt.id, 'decline')}
                />
              }
            >
              <strong>Sign-In attempt:</strong> {attempt.device}
              {attempt.ip ? ` (${attempt.ip.replace(/^::ffff:/, '')})` : ''}. Was this you?
            </Row>
          ))}
          {unreadChannels.map((ch) => (
            <Row
              key={`channel-${ch.channel_id}`}
              onOpen={() => onOpenChat({ type: 'channel', id: ch.channel_id, courseId: ch.course_id })}
              label={`Open ${ch.course_code} #${ch.channel_name}`}
              lead={<Hash size={22} color="#2563eb" style={{ flexShrink: 0 }} />}
            >
              <strong>{ch.unread}</strong> new message
              {ch.unread === 1 ? '' : 's'} in{' '}
              <strong>{ch.course_code} #{ch.channel_name}</strong>.
            </Row>
          ))}

          {unreadGroups.map((group) => (
            <Row
              key={`unread-${group.group_id}`}
              onOpen={() => onOpenChat({ type: 'group', id: group.group_id, channel: group.latest_channel })}
              label={`Open ${group.group_name}`}
              lead={
                <MessageSquare
                  size={22}
                  color="#2563eb"
                  style={{ flexShrink: 0 }}
                />
              }
            >
              <strong>{group.unread}</strong> new message
              {group.unread === 1 ? '' : 's'} in{' '}
              <strong>{group.group_name}</strong>.
            </Row>
          ))}

          {unreadDirect.map((chat) => (
            <Row
              key={`direct-${chat.user_id}`}
              onOpen={() => onOpenChat({ type: 'dm', id: chat.user_id })}
              label={`Open your chat with ${chat.user_name}`}
              lead={
                <Avatar
                  name={chat.user_name}
                  userId={chat.user_id}
                  color={chat.avatar_color}
                  hasAvatar={chat.has_avatar}
                  size={32}
                />
              }
            >
              <strong>{chat.unread}</strong> new message
              {chat.unread === 1 ? '' : 's'} from{' '}
              <strong>{chat.user_name}</strong>.
            </Row>
          ))}

          {friendRequests.map((request) => (
            <Row
              key={`request-${request.id}`}
              lead={
                <Avatar
                  name={request.other_user_name}
                  userId={request.other_user_id}
                  color={request.other_user_avatar_color}
                  hasAvatar={request.other_user_has_avatar}
                  size={32}
                />
              }
              actions={
                <RespondButtons
                  label={`request from ${request.other_user_name}`}
                  busy={busyKey === `friendRequests-${request.id}`}
                  onAccept={() =>
                    onRespond('friendRequests', request.id, 'accept')
                  }
                  onDecline={() =>
                    onRespond('friendRequests', request.id, 'decline')
                  }
                />
              }
            >
              <strong>{request.other_user_name}</strong> wants to be your
              study partner.
            </Row>
          ))}

          {groupInvites.map((invite) => (
            <Row
              key={`invite-${invite.id}`}
              lead={
                invite.members.length > 0 ? (
                  <AvatarStack members={invite.members} />
                ) : (
                  <Users
                    size={22}
                    color="#2563eb"
                    style={{ flexShrink: 0 }}
                  />
                )
              }
              actions={
                <RespondButtons
                  label={`invite to ${invite.group_name}`}
                  busy={busyKey === `groupInvites-${invite.id}`}
                  onAccept={() =>
                    onRespond('groupInvites', invite.id, 'accept')
                  }
                  onDecline={() =>
                    onRespond('groupInvites', invite.id, 'decline')
                  }
                />
              }
            >
              <strong>{invite.inviter_name}</strong> invited you to{' '}
              <strong>{invite.group_name}</strong> ({invite.course_code}).
            </Row>
          ))}

          {accepted.map((request) => (
            <Row
              key={`accepted-${request.id}`}
              lead={
                <Avatar
                  name={request.other_user_name}
                  userId={request.other_user_id}
                  color={request.other_user_avatar_color}
                  hasAvatar={request.other_user_has_avatar}
                  size={32}
                />
              }
            >
              <strong>{request.other_user_name}</strong> has accepted your
              study request.
            </Row>
          ))}

          {accepted.length > 0 && (
            <button
              type="button"
              onClick={onClearAccepted}
              style={{
                width: '100%',
                padding: '10px',
                border: 'none',
                background: '#f8fafc',
                color: '#2563eb',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Clear accepted notices
            </button>
          )}
        </div>
      )}
    </div>
  );
}