import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          borderRadius: 115,
          background: '#8BD8F1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 210, fontWeight: 700, color: '#020102', fontFamily: 'sans-serif' }}>
          SL
        </span>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
