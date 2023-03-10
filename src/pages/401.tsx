import Layout from "src/layouts/layoutScreen"

const UnauthorizedPage = () => {
  return (
    <Layout>
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <h1 className="text-4xl font-semibold sm:text-5xl">You are unauthorized!</h1>
        <h3 className="text-lg text-gray-400 sm:text-xl">Owner of this board set permissions to private</h3>
      </div>
    </Layout>
  )
}

export default UnauthorizedPage
