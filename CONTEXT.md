# Scratchpad Notes

Scratchpad is a private writing space whose notes remain local to the user's
browser. This glossary defines the product language for a note's lifecycle.

## Language

**Note lifecycle state**:
The single state that describes whether a **Note** is active, archived, or
trashed. A Note is in exactly one lifecycle state at a time.
_Avoid_: Status, visibility

**Active Note**:
A Note in the user's ordinary working collection.
_Avoid_: Live Note, Current Note

**Folder**:
A named organizational grouping to which a Note may belong, independent of the
Note's lifecycle state. A Note belongs to at most one Folder.
_Avoid_: Notebook, Category

**Tag**:
A shared label for organizing preserved Notes. Tag management applies to Active
and Archived Notes as one namespace, while Trashed Notes are excluded.
_Avoid_: Folder, Category

**Pinned Note**:
An **Active Note** given priority within the ordinary working collection. Its
pin is retained but dormant whenever the Note is archived or trashed; a dormant
pin may be shown but does not affect ordering.
_Avoid_: Favorite, Starred Note

**Daily Note**:
A Note identified with a local calendar date and belonging to the managed Daily
Notes Folder. A Daily Note may be active, archived, or trashed.
_Avoid_: Journal Entry, Dated Note

**Wikilink**:
A title-based relationship between Notes. Active and Archived Notes participate
in wikilinks and backlinks; Trashed Notes do not.
_Avoid_: External link, Bookmark

**Archived Note**:
An editable Note retained outside the ordinary working collection without
automatic deletion. It remains subject to the same local-storage risks as an
Active Note, and editing it does not change its lifecycle state.
_Avoid_: Hidden Note, Inactive Note, Deleted Note

**Archive**:
The collection of **Archived Notes**. To archive a Note is to move it from the
ordinary working collection into the Archive without marking it for deletion.
Scratchpad archives Notes only through an explicit user action or backup
restoration, never automatically.
_Avoid_: Archive Folder, Hide, Remove

**Archive date**:
The most recent time a Note entered the **Archive**, distinct from when its
content was last edited.
_Avoid_: Updated date, Modified date

**Unarchive**:
Return an **Archived Note** to the ordinary working collection.
_Avoid_: Restore

**Trashed Note**:
A Note marked for deletion but recoverable during the Trash retention period.
_Avoid_: Deleted Note

**Restore**:
Return a **Trashed Note** to the lifecycle state it occupied immediately before
entering Trash.
_Avoid_: Undelete, Unarchive

## Flagged ambiguities

**Deleted Note**:
Avoid this term because it can mean either a recoverable **Trashed Note** or a
Note that has been permanently removed.

## Example dialogue

> **User:** I finished the project, but I may need the notes again next year.
>
> **Developer:** Archive them. They become Archived Notes and remain preserved
> outside your ordinary working collection.
>
> **User:** Can I fix a typo without putting the note back in Notes?
>
> **Developer:** Yes. An Archived Note remains editable, and saving it does not
> unarchive it.
>
> **User:** Does it lose its Project Alpha folder?
>
> **Developer:** No. Lifecycle changes do not change Folder membership, so
> unarchiving returns it to the same Folder.
>
> **User:** What happens if it was pinned?
>
> **Developer:** The pin is retained but dormant while the Note is archived. It
> becomes effective again if the Note is unarchived.
>
> **User:** Can I archive older Daily Notes too?
>
> **Developer:** Yes. A Daily Note keeps its calendar-date identity and Daily
> Notes Folder membership in every lifecycle state.
>
> **User:** What if I archive today's Daily Note and then use Quick Capture?
>
> **Developer:** Quick Capture reuses the same Archived Note without
> unarchiving it. Only an explicit Unarchive changes its lifecycle state.
>
> **User:** How do I put one back with my working notes?
>
> **Developer:** Unarchive it. Restore is reserved for notes returning from
> Trash.
>
> **User:** What if I intend to remove one?
>
> **Developer:** Move it to Trash. A Trashed Note remains recoverable during
> the retention period before permanent removal.
>
> **User:** If I restore a note that I trashed from Archive, where does it go?
>
> **Developer:** Restore returns it to Archive, the lifecycle state it occupied
> before Trash.
