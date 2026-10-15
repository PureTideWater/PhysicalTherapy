import { LoadingState } from '@tp/ui';

/** Shown while any workspace screen loads. */
export default function WorkspaceLoading() {
  return <LoadingState label="Loading the screen" className="max-w-4xl" />;
}
