 export default function Home() {
  return (
    <main className="p-10 max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-4">
        SabahLot
      </h1>

      <p className="mb-8">
        Sistem Pemetaan Lot Tanah Sabah
      </p>

      <div className="border rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">
          Maklumat Lot
        </h2>

        <form className="space-y-4">
          <div>
            <label className="block mb-1">
              Nama Pemilik
            </label>
            <input
              type="text"
              className="border p-2 w-full rounded"
            />
          </div>

          <div>
            <label className="block mb-1">
              Nama Lot
            </label>
            <input
              type="text"
              className="border p-2 w-full rounded"
            />
          </div>

          <div>
            <label className="block mb-1">
              Kampung
            </label>
            <input
              type="text"
              className="border p-2 w-full rounded"
            />
          </div>

          <div>
            <label className="block mb-1">
              Daerah
            </label>
            <input
              type="text"
              className="border p-2 w-full rounded"
            />
          </div>

          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Simpan
          </button>
        </form>
      </div>
    </main>
  );
}