import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/Button.js";
import { Input } from "../ui/Input.js";
import { Toolbar } from "../ui/Toolbar.js";

interface Props {
  placeholder: string;
  addLabel: string;
  onAdd: (id: string) => void;
}

export function EntityIdToolbar({ placeholder, addLabel, onAdd }: Props) {
  const [newId, setNewId] = useState("");

  const handleAdd = () => {
    const id = newId.trim();
    if (!id) return;
    onAdd(id);
    setNewId("");
  };

  return (
    <Toolbar>
      <Input
        mono
        className="w-40 text-[11px]"
        placeholder={placeholder}
        value={newId}
        onChange={(e) => setNewId(e.target.value)}
      />
      <Button size="sm" leadingIcon={Plus} onClick={handleAdd}>
        {addLabel}
      </Button>
    </Toolbar>
  );
}
