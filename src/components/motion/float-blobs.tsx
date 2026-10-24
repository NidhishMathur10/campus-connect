/** Soft floating gradient blobs; place inside a `relative` container, behind the content. */
export function FloatBlobs() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-80 overflow-hidden">
      <div className="fx-blob fx-blob-a -top-16 -left-10 size-72" />
      <div className="fx-blob fx-blob-b top-0 right-0 size-64" />
    </div>
  );
}
