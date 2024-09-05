import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

function SubmitOfferDialog() {
  const [newOfferString, setNewOfferString] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(""); // Clear any previous error messages
    if (newOfferString.trim()) {
      try {
        await invoke("submit_offer", { offerString: newOfferString.trim() });
        setNewOfferString(""); // Clear the textarea after submission
        setIsOpen(false); // Close the dialog
      } catch (error) {
        console.error("Failed to submit offer:", error);
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitOffer(e);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Submit Offer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="dark:text-white">Submit Offer</DialogTitle>
          <DialogDescription>
            Paste your offer string below and submit it to the Splash network
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmitOffer}>
          <Textarea
            placeholder="offer1..."
            value={newOfferString}
            onChange={(e) => setNewOfferString(e.target.value)}
            onKeyDown={handleKeyDown}
            className="mb-4"
          />
          <DialogFooter>
            <Button type="submit">Submit Offer</Button>
          </DialogFooter>
          {errorMessage && (
            <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default SubmitOfferDialog;
