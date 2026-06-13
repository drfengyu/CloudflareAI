export const dynamic = "force-dynamic";

export default async function TestPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Page</h1>
      <p>If you can see this, the app is working!</p>
      <div className="mt-4">
        <a href="/login" className="text-blue-500 underline">
          Go to Login
        </a>
      </div>
    </div>
  );
}
