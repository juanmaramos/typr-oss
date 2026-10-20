import { Trans } from "@lingui/react/macro";
interface FolderViewProps {
  date: Date;
  onNavigate: (params: { date: string }) => void;
}

export function FolderView({ date, onNavigate }: FolderViewProps) {
  return (
    <div className="p-4">
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">
            <Trans>Folder View</Trans>
          </h2>
          <p className="text-muted-foreground">
            <Trans>Here you'll be able to view and manage your notes in a folder structure.</Trans>
          </p>
          <p className="text-muted-foreground mt-4">
            <Trans>Coming soon...</Trans>
          </p>
        </div>
      </div>
    </div>
  );
}
