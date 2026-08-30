import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), '.backend_config.json');

export async function GET() {
  try {
    if (!fs.existsSync(configPath)) {
      return NextResponse.json({ realTrade: false });
    }
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ realTrade: false });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    fs.writeFileSync(configPath, JSON.stringify(body));
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
