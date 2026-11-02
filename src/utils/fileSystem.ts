let selectedDirectoryHandle: FileSystemDirectoryHandle | null = null;
let selectedDirectoryName: string | null = null;

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function requestDirectoryPicker(): Promise<{ name: string; handle: FileSystemDirectoryHandle } | null> {
  if (!isFileSystemAccessSupported()) {
    return null;
  }
  try {
    // Prompt user to pick a folder or drive on their computer
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads',
    });
    selectedDirectoryHandle = handle;
    selectedDirectoryName = handle.name;
    return { name: handle.name, handle };
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      console.warn('Directory picker error:', err);
    }
    return null;
  }
}

export function getSelectedDirectoryInfo(): { name: string | null; hasHandle: boolean } {
  return {
    name: selectedDirectoryName,
    hasHandle: !!selectedDirectoryHandle,
  };
}

export function clearSelectedDirectory() {
  selectedDirectoryHandle = null;
  selectedDirectoryName = null;
}

export async function saveBlobToChosenDirectoryOrDownload(
  blob: Blob,
  fileName: string
): Promise<{ savedToDirectory: boolean; fileName: string }> {
  if (selectedDirectoryHandle) {
    try {
      // Direct write into chosen drive / folder
      const fileHandle = await selectedDirectoryHandle.getFileHandle(fileName, { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(blob);
      await writable.close();
      return { savedToDirectory: true, fileName };
    } catch (err) {
      console.warn('Failed to write directly to directory handle, falling back to standard download:', err);
    }
  }

  // Standard fallback browser download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 3000);

  return { savedToDirectory: false, fileName };
}
