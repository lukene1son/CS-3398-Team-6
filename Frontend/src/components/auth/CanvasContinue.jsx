import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { completeCanvasLaunch } from '../../api';

export default function CanvasContinue({ user }) {
  const navigate = useNavigate();
  const check = useRef(null);
  const [course, setCourse] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    check.current ??= completeCanvasLaunch(false);
    check.current.then((result) => {
      if (!active) return;
      if (result.confirmationRequired) {
        setCourse(result.course);
      } else {
        navigate('/dashboard', { replace: true, state: { canvasCourseId: result.course.id } });
      }
    }).catch((err) => {
      if (active) setError(err.message);
    });
    return () => { active = false; };
  }, [navigate]);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const result = await completeCanvasLaunch(true);
      navigate('/dashboard', { replace: true, state: { canvasCourseId: result.course.id } });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: '36rem', margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Open your Canvas course in BuddyTech</h1>
      {!course && !error && <p>Checking your Canvas launch…</p>}
      {course && (
        <>
          <p>Link your Canvas account to <strong>{user.name}</strong> in BuddyTech and join {course.course_code} · {course.course_name}.</p>
          <button type="button" onClick={confirm} disabled={busy}>
            {busy ? 'Linking…' : 'Link account and open Space'}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <p><Link to="/dashboard">Go to my dashboard</Link></p>
    </main>
  );
}
