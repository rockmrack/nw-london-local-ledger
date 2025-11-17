/**
 * Loading skeleton for footer during streaming SSR
 */
export function LoadingFooter() {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Footer columns skeleton */}
          {[1, 2, 3, 4].map((col) => (
            <div key={col}>
              <div className="skeleton h-6 w-32 mb-4 bg-gray-700 rounded"></div>
              <div className="space-y-2">
                {[1, 2, 3, 4].map((link) => (
                  <div key={link} className="skeleton h-4 w-24 bg-gray-700 rounded"></div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer bottom skeleton */}
        <div className="mt-8 pt-8 border-t border-gray-800">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="skeleton h-4 w-48 bg-gray-700 rounded mb-4 md:mb-0"></div>
            <div className="flex space-x-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-6 w-6 bg-gray-700 rounded-full"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}