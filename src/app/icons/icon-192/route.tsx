import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 192,
          height: 192,
          borderRadius: 43,
          background: '#8BD8F1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 80, fontWeight: 700, color: '#020102', fontFamily: 'sans-serif' }}>
          SL
        </span>
      </div>
    ),
    { width: 192, height: 192 }
  );
}
