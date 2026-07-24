import { FileManager } from "@/components/file-manager";

export default function FilesAdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Files</h1>
        <p className="text-sm text-zinc-500">
          Manage every file across all series. To add files to a specific series, open it from the
          Series tab instead.
        </p>
      </div>
      <FileManager />
    </div>
  );
}
