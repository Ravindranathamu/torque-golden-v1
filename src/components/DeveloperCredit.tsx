import { Mail, Phone } from "lucide-react";
import { classNames } from "../lib/utils";
import { COPYRIGHT, DEVELOPER } from "../lib/developer";

export function DeveloperCredit({
  dark = false,
  compact = false,
  className,
}: {
  dark?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={classNames(
        "developer-credit",
        dark && "dark",
        compact && "compact",
        className,
      )}
    >
      <span className="dc-brand">Powered by {DEVELOPER.name}</span>
      <span className="dc-copy">{COPYRIGHT}</span>
      <span className="dc-links">
        <a className="dc-link" href={`mailto:${DEVELOPER.email}`}>
          <Mail aria-hidden="true" />
          {DEVELOPER.email}
        </a>
        <a className="dc-link" href={`tel:${DEVELOPER.phone}`}>
          <Phone aria-hidden="true" />
          {DEVELOPER.phoneDisplay}
        </a>
      </span>
    </div>
  );
}
