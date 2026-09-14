import { useRef, useState, type PointerEvent } from 'react';

export default function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const pointer = useRef<number | null>(null);

  const update = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const length = Math.max(32, Math.hypot(dx, dy));
    const x = dx / length;
    const y = dy / length;
    setPosition({ x: x * 32, y: y * 32 });
    onMove(x, y);
  };
  const release = () => {
    pointer.current = null;
    setActive(false);
    setPosition({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div className={`joystick ${active ? 'is-active' : ''}`} role="group" aria-label="Movement joystick" tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setActive(true);
        update(event);
      }}
      onPointerMove={(event) => { if (event.pointerId === pointer.current) update(event); }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      <span className="joystick-axis axis-horizontal" />
      <span className="joystick-axis axis-vertical" />
      <span className="joystick-knob" style={{ transform: `translate(${position.x}px, ${position.y}px)` }} />
      <span className="joystick-label">MOVE</span>
    </div>
  );
}