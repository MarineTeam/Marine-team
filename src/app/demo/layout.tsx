export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="bg-amber-100 text-amber-900 text-center text-sm py-2 px-4 dark:bg-amber-900 dark:text-amber-100">
        Demo — simulated content in a separate database, not connected to real Bunny/Auth0.
      </div>
      {children}
    </div>
  );
}
