import { EvmError } from "@ethereumjs/evm";
import {
    Address,
    BIGINT_0,
    BIGINT_1,
    BIGINT_160,
    bigIntToBytes,
    setLengthLeft,
    setLengthRight
} from "@ethereumjs/util";

/**
 * The following code has been copied from
 *
 * https://github.com/ethereumjs/ethereumjs-monorepo/blob/master/packages/evm/src/opcodes/util.ts
 *
 * Since its not exported by the underyling package, but we need it to hack on the VM to add foundry cheatcodes.
 */

/**
 * Wraps error message as EvmError
 */
export function trap(err: string): never {
    // TODO: facilitate extra data along with errors
    throw new EvmError(err as any);
}

/**
 * Returns an overflow-safe slice of an array. It right-pads
 * the data with zeros to `length`.
 */
export function getDataSlice(data: Uint8Array, offset: bigint, length: bigint): Uint8Array {
    const len = BigInt(data.length);
    if (offset > len) {
        offset = len;
    }

    let end = offset + length;
    if (end > len) {
        end = len;
    }

    data = data.subarray(Number(offset), Number(end));
    // Right-pad with zeros to fill dataLength bytes
    data = setLengthRight(data, Number(length));

    return data;
}

/**
 * Writes data returned by evm.call* methods to memory
 */
export function writeCallOutput(runState: any, outOffset: bigint, outLength: bigint): void {
    const returnData = runState.interpreter.getReturnData();
    if (returnData.length > 0) {
        const memOffset = Number(outOffset);
        let dataLength = Number(outLength);
        if (BigInt(returnData.length) < dataLength) {
            dataLength = returnData.length;
        }
        const data = getDataSlice(returnData, BIGINT_0, BigInt(dataLength));
        runState.memory.extend(memOffset, dataLength);
        runState.memory.write(memOffset, dataLength, data);
    }
}

/**
 * Returns an Address object from a bigint address (they are stored as bigints on the stack)
 * @param value The bigint address
 */
export function createAddressFromBigInt(value: bigint): Address {
    const bytes = bigIntToBytes(value);
    if (bytes.length > 20) {
        throw new Error(`Invalid address, too long: ${bytes.length}`);
    }
    return new Address(setLengthLeft(bytes, 20));
}

const MASK_160 = (BIGINT_1 << BIGINT_160) - BIGINT_1;

/**
 * Create an address from a stack item (256 bit integer).
 * This wrapper ensures that the value is masked to 160 bits.
 * @param value 160-bit integer
 */
export function createAddressFromStackBigInt(value: bigint): Address {
    const maskedValue = value & MASK_160;
    return createAddressFromBigInt(maskedValue);
}
