import { create } from "zustand"
import { uuidv4 as uuid } from "@firebase/util"
import { Boxes, Columns, Board, Snapshot, Builder } from "src/utils/types"
import { collection, DocumentReference, DocumentData, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, Query } from "firebase/firestore"
import { DropResult } from "react-beautiful-dnd"
import { database } from "src/utils/firebase"

interface Store {
  path: string
  order: string[]
  boxes: Boxes
  board: Board | null
  columns: Columns
  builder: Builder
  status: number

  ownerID: string
  boardID: string
  userID: string | null

  boardDocRef: (pathSegments?: string[]) => DocumentReference
  boardCollectionRef: (pathSegments?: string[]) => Query<DocumentData>

  updateBuilder: (payload: any) => void
  setStatus: (payload: number) => void

  addBox: (column: string) => void
  editBox: (id: string, name: string) => void
  deleteBox: (columnID: string, boxID: string) => void
  deleteAllColumnBoxes: (columnID: string) => void

  updateBoard: (payload: any) => void
  deleteBoard: () => void

  fetchBoard: () => void
  fetchBoxes: () => void
  fetchColumns: () => void
  initializeBoard: (ownerID: string, boardID: string, userID: string) => void

  DragAndDrop: (result: DropResult) => void
}

const useBoardStore = create<Store>((set, get) => ({
  path: "",
  order: [],
  boxes: {},
  board: null,
  columns: {},
  builder: {},
  status: 0,

  ownerID: "",
  boardID: "",
  userID: null,

  boardDocRef: (pathSegments?: string[]) => doc(database, get().path, ...(pathSegments?.length ? pathSegments : [])),
  boardCollectionRef: (pathSegments?: string[]) => collection(database, get().path, ...(pathSegments?.length ? pathSegments : [])),

  updateBuilder: (payload: any) => set((state) => ({ builder: { ...state.builder, ...payload } })),
  setStatus: (payload: number) => set({ status: payload }),

  addBox: async (column: string) => {
    if (!get().builder[column].value) return
    const id = uuid()
    const box = { [id]: { name: get().builder[column].value } }
    const columnBoxes = [...get().columns[column].boxes, id]

    get().updateBuilder({ [column]: { state: false, value: "" } })

    set({ boxes: { ...get().boxes, ...box } })
    set({
      columns: {
        ...get().columns,
        [column]: { ...get().columns[column], boxes: columnBoxes },
      },
    })

    await updateDoc(get().boardDocRef(["columns", column]), { boxes: columnBoxes })
    await setDoc(get().boardDocRef(["boxes", id]), box[id])
  },

  editBox: async (id: string, name: string) => {
    set({ boxes: { ...get().boxes, [id]: { ...get().boxes[id], name: name } } })
    await updateDoc(get().boardDocRef(["boxes", id]), { name: name })
  },

  deleteBox: async (columnID: string, boxID: string) => {
    const columnBoxes = get().columns[columnID].boxes.filter((box) => box !== boxID)
    await deleteDoc(get().boardDocRef(["boxes", boxID]))
    await updateDoc(get().boardDocRef(["columns", columnID]), { boxes: columnBoxes })

    set((state) => ({
      columns: {
        ...state.columns,
        [columnID]: {
          ...state.columns[columnID],
          boxes: [...columnBoxes],
        },
      },
    }))
  },

  deleteAllColumnBoxes: async (columnID: string) => {
    const boxes = get().boxes
    const columnBoxes = get().columns[columnID].boxes
    await updateDoc(get().boardDocRef(["columns", columnID]), { boxes: [] })
    columnBoxes.forEach((boxID) => {
      deleteDoc(get().boardDocRef(["boxes", boxID]))
      delete boxes[boxID]
    })
    set((state) => ({
      columns: {
        ...state.columns,
        [columnID]: {
          ...state.columns[columnID],
          boxes: [],
        },
      },
      boxes,
    }))
  },

  updateBoard: async (payload: any) => {
    if (get()?.userID !== get().ownerID) return
    await updateDoc(get().boardDocRef(), payload)
    set({ board: payload })
  },

  deleteBoard: async () => {
    if (get()?.userID !== get().ownerID) return
    await deleteDoc(get().boardDocRef())
  },

  fetchBoard: async () => {
    const docSnap = await getDoc(get().boardDocRef())

    if (!docSnap.exists()) return set({ status: 404 })
    if (!docSnap.data().public && get().userID !== get().ownerID) return set({ status: 401 })

    set({ order: docSnap.data().order, board: docSnap.data() as Board, status: 200 })
    // console.log("%cFetch: Board", "color: green", docSnap.data())
  },

  fetchColumns: async () => {
    const snapshot = await getDocs(get().boardCollectionRef(["columns"]))
    const snapColumns: Snapshot = {}
    const builder: Builder = {}

    snapshot.forEach((column) => {
      if (column.exists()) {
        snapColumns[column.id] = column.data()
        builder[column.id] = { state: false, value: "" }
      }
    })

    set({ columns: snapColumns as Columns, builder })
    // console.log("%cFetch: Columns", "color: green", snapColumns)
  },

  fetchBoxes: async () => {
    const snapshotBoxes = await getDocs(get().boardCollectionRef(["boxes"]))
    const snapBoxes: Snapshot = {}

    snapshotBoxes.forEach((box) => {
      if (box.exists()) snapBoxes[box.id] = box.data()
    })

    set({ boxes: snapBoxes as Boxes })
    // console.log("%cFetch: Boxes", "color: green", snapBoxes)
  },

  initializeBoard: (ownerID: string, boardID: string, userID: string) => {
    if (!ownerID || !boardID) return set({ status: 404 })
    set({ ownerID, boardID, userID, path: `users/${ownerID}/boards/${boardID}` })
    get().fetchBoard()
    get().fetchBoxes()
    get().fetchColumns()
  },

  DragAndDrop: async (result: DropResult) => {
    // console.log("%cEvent: Drag and Drop", "color: yellow", result)
    // console.time()

    if (!result.destination) return
    const { source, destination } = result

    if (source.droppableId === destination.droppableId) {
      const sourceBoxes = [...get().columns[source.droppableId].boxes]
      sourceBoxes.splice(source.index, 1)
      sourceBoxes.splice(destination.index, 0, result.draggableId)
      set((state) => ({
        columns: {
          ...state.columns,
          [source.droppableId]: {
            ...state.columns[source.droppableId],
            boxes: sourceBoxes,
          },
        },
      }))

      await updateDoc(get().boardDocRef(["columns", source.droppableId]), {
        boxes: sourceBoxes,
      })
    } else {
      const sourceBoxes = [...get().columns[source.droppableId].boxes]
      const destinationBoxes = [...get().columns[destination.droppableId].boxes]

      sourceBoxes.splice(source.index, 1)
      destinationBoxes.splice(destination.index, 0, result.draggableId)
      set((state) => ({
        columns: {
          ...state.columns,
          [source.droppableId]: {
            ...state.columns[source.droppableId],
            boxes: sourceBoxes,
          },
          [destination.droppableId]: {
            ...state.columns[destination.droppableId],
            boxes: destinationBoxes,
          },
        },
      }))

      await updateDoc(get().boardDocRef(["columns", source.droppableId]), {
        boxes: sourceBoxes,
      })
      await updateDoc(get().boardDocRef(["columns", destination.droppableId]), {
        boxes: destinationBoxes,
      })
    }
    // console.timeEnd()
  },
}))

export default useBoardStore
