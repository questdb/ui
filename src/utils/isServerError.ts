// isServerError takes api response and checks if the error is of type server error or timeout
// returns true if server error type
export const isServerError = (response: Response): boolean => {
    return response.status === 408 || response.status >= 500;
};
