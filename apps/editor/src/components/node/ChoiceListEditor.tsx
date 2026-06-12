import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChoiceContent } from "../../types/wire.js";
import { translate } from "../../lib/i18n.js";

function newChoice(): ChoiceContent {
  return { id: `choice_${crypto.randomUUID()}`, label: translate("defaults.newChoice"), goto: "" };
}
import { Button } from "../ui/Button.js";
import { ChoiceEditor } from "./ChoiceEditor.js";

interface ChoiceListEditorProps {
  choices: ChoiceContent[];
  chapterIds: string[];
  onChange: (choices: ChoiceContent[]) => void;
}

export function ChoiceListEditor({ choices, chapterIds, onChange }: ChoiceListEditorProps) {
  const { t } = useTranslation();

  return (
    <div>
      {choices.map((choice, i) => (
        <ChoiceEditor
          key={choice.id}
          choice={choice}
          chapterIds={chapterIds}
          onChange={(next) => {
            const copy = [...choices];
            copy[i] = next;
            onChange(copy);
          }}
          onRemove={() => onChange(choices.filter((_, j) => j !== i))}
        />
      ))}
      <Button size="sm" leadingIcon={Plus} onClick={() => onChange([...choices, newChoice()])}>
        {t("choice.add")}
      </Button>
    </div>
  );
}
