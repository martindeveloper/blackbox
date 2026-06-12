import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useModal } from "../../context/ModalProvider.js";
import { Button } from "./Button.js";
import { InspectorTitle } from "./Heading.js";

interface Props {
  id: string;
  titleKey: string;
  messageKey: string;
  messageParams: Record<string, string>;
  onDelete: () => void;
}

export function InspectorDeleteHeader({
  id,
  titleKey,
  messageKey,
  messageParams,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const { confirm } = useModal();

  const handleDelete = () =>
    void (async () => {
      const ok = await confirm({
        title: t(titleKey),
        message: t(messageKey, messageParams),
        variant: "danger",
        confirmLabel: t("common.delete"),
      });
      if (ok) onDelete();
    })();

  return (
    <div className="flex items-center justify-between">
      <InspectorTitle>{id}</InspectorTitle>
      <Button variant="danger" size="sm" leadingIcon={Trash2} onClick={handleDelete}>
        {t("common.delete")}
      </Button>
    </div>
  );
}
