// Local UI-only types for the Alerts tab
export type ModalKind =
  | "add_trigger"
  | "edit_trigger"
  | "add_sub_action"
  | "edit_sub_action"
  | "edit_action_meta"
  | "confirm_delete"
  | "simulation"
  | null;

export interface ModalState {
  kind: ModalKind;
  payload?: unknown;
}
