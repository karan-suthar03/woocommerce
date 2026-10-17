import { catalogFetch } from './catalog-fetch'

export const listCategories = async function () {
  return catalogFetch<any>("/store/product-categories", { fields: '+category_children' }, "categories")
    .then(({ product_categories }) => product_categories)
}

export const getCategoriesList = async function (
  offset: number = 0,
  limit: number = 100
) {
  return catalogFetch<any>("/store/product-categories", 
    // TODO: Look into fixing the type
    // @ts-ignore
    { limit, offset },
    "categories"
  )
}

export const getCategoryByHandle = async function (categoryHandle: string[]) {
  return catalogFetch<any>("/store/product-categories", 
    // TODO: Look into fixing the type
    // @ts-ignore
    { handle: categoryHandle },
    "categories"
  )
}
