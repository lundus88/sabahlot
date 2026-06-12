 "use client";

import Map from "./components/Map";

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-5xl font-bold text-center mb-4">SabahLot</h1>

      <p className="text-center text-xl mb-8">
        Sistem Pemetaan Lot Tanah Sabah
      </p>

      <div className="border rounded-lg p-6 mb-8">
        <h2 className="text-3xl font-bold mb-6">Maklumat Lot</h2>

        <form className="space-y-4">
          <input type="text" placeholder="Nama Pemilik" className="border p-2 w-full rounded" />
          <input type="text" placeholder="Nama Lot" className="border p-2 w-full rounded" />
          <input type="text" placeholder="Kampung" className="border p-2 w-full rounded" />
          <input type="text" placeholder="Daerah" className="border p-2 w-full rounded" />

          <button type="button" className="bg-blue-600 text-white px-4 py-2 rounded">
            Simpan
          </button>
        </form>
      </div>

      <h2 className="text-3xl font-bold mb-4">Peta Lot</h2>
      <Map />
    </main>
  );
}