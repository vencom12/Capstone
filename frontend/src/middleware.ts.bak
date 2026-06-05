import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Gate the Admin route
  if (pathname.startsWith('/admin')) {
    const hasAdminToken = request.cookies.has('admin_token');
    if (!hasAdminToken) {
      const loginUrl = new URL('/', request.url);
      loginUrl.searchParams.set('auth', 'login');
      loginUrl.searchParams.set('role', 'admin');
      return NextResponse.redirect(loginUrl);
    }
  }

  // Gate the Employee route
  if (pathname.startsWith('/employee')) {
    const hasEmployeeToken = request.cookies.has('employee_token');
    if (!hasEmployeeToken) {
      const loginUrl = new URL('/', request.url);
      loginUrl.searchParams.set('auth', 'login');
      loginUrl.searchParams.set('role', 'employee');
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

// Only match admin and employee dashboard sub-paths
export const config = {
  matcher: ['/admin/:path*', '/employee/:path*'],
};
