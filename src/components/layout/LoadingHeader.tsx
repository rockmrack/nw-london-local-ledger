/**
 * Loading skeleton for header during streaming SSR
 */
export function LoadingHeader() {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo skeleton */}
          <div className="flex items-center">
            <div className="skeleton h-8 w-48 rounded bg-gray-200"></div>
          </div>

          {/* Navigation skeleton */}
          <nav className="hidden md:flex space-x-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-4 w-20 rounded bg-gray-200"></div>
            ))}
          </nav>

          {/* Mobile menu button skeleton */}
          <div className="md:hidden">
            <div className="skeleton h-8 w-8 rounded bg-gray-200"></div>
          </div>
        </div>
      </div>
    </header>
  );
}