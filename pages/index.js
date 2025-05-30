import dynamic from 'next/dynamic';
import Head from 'next/head';

// Dynamically import the PdfViewer with SSR disabled
const PdfViewer = dynamic(() => import('../components/PdfViewer'), { ssr: false });

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Head>
        <title>PDF Editor</title>
        <meta name="description" content="Client-side PDF Editor using PDF.js, Fabric.js, and PDF-lib" />
      </Head>

      <header className="bg-blue-600 text-white py-4 shadow-md">
        <h1 className="text-center text-2xl font-semibold">Client-Side PDF Editor</h1>
      </header>

      <main className="max-w-4xl mx-auto mt-8 bg-white p-6 rounded-lg shadow">
        <PdfViewer />
      </main>

      <footer className="text-center text-sm text-gray-500 mt-10 mb-4">
        © {new Date().getFullYear()} PDF Editor • Built with Next.js & Fabric.js
      </footer>
    </div>
  );
}
