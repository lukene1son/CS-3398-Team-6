
import React from 'react';
import { UserRound, Bell } from 'lucide-react';

export default function PartnerNotifications({ requests = [] }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '45px',
        right: 0,
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
        Study Partner Requests
      </div>

      {requests.length === 0 ? (
        <div
          style={{
            padding: '28px 16px',
            textAlign: 'center',
            color: '#64748b',
          }}
        >
          <Bell size={28} style={{ marginBottom: '10px' }} />
          <p style={{ margin: 0 }}>No new study partner requests.</p>
        </div>
      ) : (
        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
          {requests.map((request) => (
            <div
              key={request.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              <UserRound size={22} color="#2563eb" />

              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.9rem',
                    color: '#1e293b',
                  }}
                >
                  <strong>{request.name}</strong> wants to be your study partner.
                </p>

                {request.course && (
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: '0.8rem',
                      color: '#64748b',
                    }}
                  >
                    {request.course}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
